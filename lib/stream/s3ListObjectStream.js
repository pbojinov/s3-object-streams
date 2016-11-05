/**
 * @fileOverview ListObjectStream class definition.
 */

// Core.
var Transform = require('stream').Transform;
var util = require('util');

//---------------------------------------------------------------------------
// Class constructor.
//---------------------------------------------------------------------------

/**
 * @class An object stream to list S3 objects.
 *
 * Pipe in objects of the following form:
 *
 * {
 *   s3Client: new AWS.S3(),
 *   bucket: 'exampleBucket',
 *   # Optional, defaults to 1000. How many objects to return in one API
 *   # request under the hood.
 *   maxKeys: 1000,
 *   # Optional. If present, only list objects with keys matching the prefix.
 *   prefix: 'examplePrefix'
 * }
 *
 * Pipe out standard response objects from the S3 listObjects API:
 *
 * {
 *   Key: ...
 *   LastModified: ...
 *   ETag: ...
 *   Size: ...
 *   StorageClass: ...
 *   Owner: {
 *     DisplayName: ...
 *     ID: ...
 *   }
 * }
 *
 * @param {Object} options Standard stream options.
 */
function S3ListObjectStream (options) {
  options = options || {};
  // Important; make this an object stream.
  options.objectMode = true;

  S3ListObjectStream.super_.call(this, options);
}

util.inherits(S3ListObjectStream, Transform);

//---------------------------------------------------------------------------
// Methods
//---------------------------------------------------------------------------

/**
 * List one page of objects from the specified bucket.
 *
 * If providing a prefix, only keys matching the prefix will be returned.
 *
 * If providing a marker, list a page of keys starting from the marker
 * position. Otherwise return the first page of keys.
 *
 * @param {Object} options
 * @param {AWS.S3} options.s3Client An AWS client instance.
 * @param {String} options.bucket The bucket name.
 * @param {String} [options.prefix] If set only return keys beginning with
 *   the prefix value.
 * @param {String} [options.marker] If set the list only a paged set of keys
 *   starting from the marker.
 * @param {Number} [options.maxKeys] Maximum number of keys to return per
 *   request. Defaults to 1000.
 * @param {Function} callback - Callback of the form
    function (error, nextMarker, Object[]).
 */
S3ListObjectStream.prototype.listObjectsPage = function (options, callback) {
  var params = {
    Bucket: options.bucket,
    Marker: options.marker,
    MaxKeys: options.maxKeys,
    Prefix: options.prefix
  };

  options.s3Client.listObjects(params, function (error, response) {
    var nextMarker;

    if (error) {
      return callback(error);
    }

    // Check to see if there are yet more keys to be obtained, and if so
    // return the marker for use in the next request.
    if (response.IsTruncated) {
      // For normal listing, there is no response.NextMarker
      // and we must use the last key instead.
      nextMarker = response.Contents[response.Contents.length - 1].Key;
    }

    callback(null, nextMarker, response.Contents);
  });
};

/**
 * List objects from S3 and push them to the stream.
 *
 * @param {Object} options
 * @param {AWS.S3} options.s3Client An AWS client instance.
 * @param {String} options.bucket The bucket to list.
 * @param {Number} [options.maxKeys] Maximum number of keys to return per
 *   request. Defaults to 1000.
 * @param {String} [options.prefix] If present, only list objects with keys that
 *   match the prefix.
 * @param {String} encoding Irrelevant since this is an object stream.
 * @param {Function} callback Invoked after this listing is processed.
 */
S3ListObjectStream.prototype.listObjects = function (options, callback) {
  var self = this;

  options.maxKeys = options.maxKeys || 1000;

  /**
   * Recursively list objects.
   *
   * @param {String|undefined} marker A value provided by the S3 API to enable
   *   paging of large lists of keys. The result set requested starts from the
   *   marker. If not provided, then the list starts from the first key.
   */
  function listRecusively (marker) {
    options.marker = marker;

    self.listObjectsPage(
      options,
      function (error, nextMarker, s3Objects) {
        if (error) {
          return callback(error);
        }

        // Send all of these S3 object definitions to be piped onwards.
        s3Objects.forEach(function (object) {
          self.push(object);
        });

        if (nextMarker) {
          listRecusively(nextMarker);
        }
        else {
          callback();
        }
      }
    );
  }

  // Start the recursive listing at the beginning, with no marker.
  listRecusively();
};


/**
 * Implementation of the necessary transform method.
 *
 * @param {Object} data A listObjects configuration object since this is an
 *   object stream.
 * @param {String} encoding Irrelevant since this is an object stream.
 * @param {Function} callback Invoked after this listing is processed.
 */
S3ListObjectStream.prototype._transform = function (data, encoding, callback) {
  this.listObjects(data, callback);
};

//---------------------------------------------------------------------------
// Export class constructor.
//---------------------------------------------------------------------------

module.exports = S3ListObjectStream;