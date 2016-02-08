var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm').subClass({ imageMagick: true });
var util = require('util');
var fs = require('fs');
var s3 = new AWS.S3();

// set the different sizes you need
var SIZES = [120, 512, 1024];
var SUFFIX = '-resized';

/**
 * Perform a resize of a newly uploaded file with the values in array SIZES.
 * Store them into a suffixed bucket
 */
exports.handler = function(event, context) {

  // Read options from the event.
  console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
  var srcBucket = event.Records[0].s3.bucket.name;
  var srcKey = event.Records[0].s3.object.key;
  var dstBucket = srcBucket + SUFFIX;

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

    // write the file to a temp directory so we can stream it.
    // TODO: Turn this into a stream instead.
    fs.writeFile('/tmp/object.jp2', response.Body, function(err) {
      if (err) {
        return console.log('error while writing: ' + err);
      }

      if (fileExists('/tmp/object.jp2')) {
        var original = gm(fs.createReadStream('/tmp/object.jp2'))

        // Identify the size.
        // note from GM docs:
        // GOTCHA:
        // when working with input streams and any 'identify'
        // operation (size, format, etc), you must pass "{bufferStream: true}" if
        // you also need to convert (write() or stream()) the image afterwards
        // NOTE: this buffers the readStream in memory!
        original
        .size({bufferStream: true}, function(err, size) {
          if (err) {
            return console.error(err);
          }

          // Transform, and upload to a different S3 bucket.
          async.each(SIZES,
            function (maxSize, callback) {
              _resizeAndUpload(size, maxSize, imageType, original, srcKey, dstBucket, response.ContentType, callback);
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
      }
    });
  });
};

/**
 * Perform a resize and upload.
 *
 * @param {Number} size
 * @param {Number} maxSize
 * @param {String} imageType
 * @param {Stream} original
 * @param {String} srcKey
 * @param {String} dstBucket
 * @param {String} contentType
 * @param {Function} callback
 * @return {Undefined}
 */
var _resizeAndUpload = function(size, maxSize, imageType, original, srcKey, dstBucket, contentType, callback) {

  var dstKey = maxSize +  "_" + srcKey;

  // transform, and upload to a different S3 bucket.
  async.waterfall([
    function transform(next) {
      // Infer the scaling factor to avoid stretching the image unnaturally.
      // use the short edge.
      var scalingFactor = Math.max(maxSize / size.width, maxSize / size.height);
      var width  = scalingFactor * size.width;
      var height = scalingFactor * size.height;

      // Transform the image buffer in memory.
      original
        .resize(width, height)
        .stream(function(err, stdout, stderr) {
          if (err) {
            console.log('error writing file');
            next(err);
          }

          var destFile = '/tmp/resized.jpg';
          var writeStream = fs.createWriteStream(destFile, { encoding: 'base64' });

          stdout.pipe(writeStream);
          stdout.on('end', function() {
            next(null, fs.createReadStream(destFile));
          });
        });
    },
    function upload(readStream, next) {
      readStream.on('open', function() {
        s3.putObject({
          Bucket: dstBucket,
          Key: dstKey,
          Body: readStream,
          ContentType: contentType
        }, next);
      });
    }], function (err) {
      console.log('Completed resize process: ' + dstBucket + '/' + dstKey);

      if (err) {
        console.error(err);
      } else {
        console.log('Successfully resized ' + dstKey);
      }

      callback(err);
  });
};

/**
 * Check to see if the file exists
 * @param {String} filename
 * @return {Boolean}
 */
function fileExists(filename) {
  try {
    stats = fs.lstatSync(filename);
    return stats.isFile();
  }
  catch(e) {
    // didn't exist at all
    console.log('could not find ' + filename);
    return false;
  }

  return false;
}
