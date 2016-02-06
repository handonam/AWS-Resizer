var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm').subClass({ imageMagick: true });
var util = require('util');
var s3 = new AWS.S3();

// set the different sizes you need
var SIZES = [120, 512, 1024];

exports.handler = function(event, context) {

  // Read options from the event.
  console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
  var srcBucket = event.Records[0].s3.bucket.name;
  var srcKey = event.Records[0].s3.object.key;
  var dstBucket = srcBucket + '-resized';

  // Figure out the image type here
  var typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    console.error('Image type unrecognizable: ' + srcKey);
    return context.done();
  }
  var imageType = typeMatch[1];
  if (imageType != 'jpg' && imageType != 'png') {
    console.log('Not JPG/PNG, skipping: ' + srcKey);
    return context.done();
  }

  // Make sure we're using different buckets.
  if (srcBucket == dstBucket) {
    console.error('Destination bucket must not match source bucket.');
    return context.done();
  }

  // Download the image from S3
  s3.getObject({ Bucket: srcBucket, Key: srcKey }, function(err, response) {
    if (err) {
      return console.error('Unable to download image ' + err);
    }

    var contentType = response.ContentType;
    var original =  gm(response.Body);
    original.size(function(err, size){
      if (err) {
        return console.error(err);
      }

      //transform, and upload to a different S3 bucket.
      async.each(SIZES,
        function (max_size,  callback) {
          _resizeAndUpload(size, max_size, imageType, original, srcKey, dstBucket, contentType, callback);
        },
        function (err) {
          if (err) {
            console.error('Unable to resize ' + srcBucket + ' due to an error: ' + err);
          } else {
            console.log('Successfully resized ' + srcBucket);
          }

          context.done();
        }
      );
    });
  });
};

var _resizeAndUpload = function(size, max_size, imageType, original, srcKey, dstBucket, contentType, done) {

  var dstKey = max_size +  "_" + srcKey;

  // transform, and upload to a different S3 bucket.
  async.waterfall([
    function transform(next) {
      // Infer the scaling factor to avoid stretching the image unnaturally.
      // use the short edge.
      var scalingFactor = Math.max(max_size / size.width, max_size / size.height);
      var width  = scalingFactor * size.width;
      var height = scalingFactor * size.height;

      // Transform the image buffer in memory.
      original
        .resize(width, height)
        .toBuffer(imageType, function(err, buffer) {
          if (err) {
            next(err);
          } else {
            next(null, buffer);
          }
        });
    },
    function upload(data, next) {
      s3.putObject({
        Bucket: dstBucket,
        Key: dstKey,
        Body: data,
        ContentType: contentType
      }, next);
    }], function (err) {
      console.log('Completed resize process: ' + dstBucket + '/' + dstKey);

      if (err) {
        console.error(err);
      } else {
        console.log(
          'Successfully resized ' + dstKey
        );
      }

      done(err);
  });
};
