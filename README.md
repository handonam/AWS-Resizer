# AWS-Resizer with Streams

An AWS Lambda function that duplicates images to different sizes.
Using streams, this reduces the buffer overflow when processing files, which 
typically causes the imagemagick library to complain. 

Currently only supports JPG and PNG.  Looking to add .gif support in the future.

##Instructions
 1. Run `npm install` (duh!)
 2. Modify the `SIZES` values to choose what files to use
 3. Run `make lambda` to generate an packaged lambda zip file
