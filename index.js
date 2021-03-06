/**
 * artoo.js Gulp Task
 * ===================
 *
 * A simple task to create an artoo.js bookmarklet.
 */
var fs = require('fs'),
    path = require('path'),
    through = require('through2'),
    stream = require('stream'),
    gutil = require('gulp-util'),
    uglify = require('uglify-js'),
    helpers = require('./helpers.js'),
    config = require('./config.json'),
    _t = require('lodash.template'),
    PluginError = gutil.PluginError,
    File = gutil.File;

// Reading template synchronously once
var bookmarkTemplate = fs.readFileSync(
  __dirname + '/bookmarklet.tpl',
  'utf-8'
);

// Constants
const PLUGIN_NAME = 'gulp-artoo';

// Utilities
function isValidVersion(version) {
  return typeof version === 'string' &&
         (version === 'latest' ||
          version === 'edge' ||
          version.split('.').length === 3);
}

function minify(string) {
  return uglify.minify(string, {fromString: true}).code;
}

function process(string, opts) {

  // Including file contents
  if (string)
    opts.settings.eval = JSON.stringify(string);

  // Templating
  return 'javascript: ' + minify(
    _t(bookmarkTemplate, {
      settings: JSON.stringify(opts.settings),
      url: opts.url,
      loadingText: opts.loadingText ?
        "console.log('" + opts.loadingText + "');" : '',
      random: opts.random ?
        "var r = Math.random(); script.src += '?r=' + r;" : ''
    })
  );
}

function external(type, string, name) {
  var tpl = ';(function(undefined) {' +
            'artoo.<%= type %>[\'<%= name %>\'] = ' +
            '<%= content %>;' +
            '}).call(this);';

  return _t(tpl, {
    type: type,
    name: name,
    content: JSON.stringify(string)
  });
}

// Mains Task
function bookmarklet(options) {

  // Extending options
  var opts = helpers.extend(options, config.defaults);

  // Excluding eval
  delete opts.settings.eval;

  // Forging url
  opts.url = opts.url ||
               config.prodUrl + 'artoo-' + opts.version + '.min.js';

  // Stream action
  var stream = through.obj(function(file, enc, callback) {

    // Is version valid?
    if (!isValidVersion(opts.version))
      return this.emit('error',
        new PluginError(PLUGIN_NAME, 'Invalid version'));

    // File is null
    if (file.isNull()) {

      // Do nothing if no content
    }

    // File is a buffer
    else if (file.isBuffer()) {
      file.contents = new Buffer(process(file.contents.toString(), opts));
    }

    // File is stream
    // TODO: support streams
    else if (file.isStream()) {
      return this.emit('error',
        new PluginError(PLUGIN_NAME,  'Streaming not supported'));
    }

    this.push(file);
    return callback();
  });

  // Returning the stream
  return stream;
}

// Templates and Stylesheets
function makeExternalTask(type) {
  return function(base) {
    base = base || type;

    var stream = through.obj(function(file, enc, callback) {

      // Determining name of external file
      var name = path.join(file.cwd, base);
      if (!fs.existsSync(path.resolve(name)))
        name = path.relative(file.cwd, file.path);
      else
        name = path.relative(name, file.path);

      // File is null
      if (file.isNull()) {

        // Do nothing if no content
      }

      // File is a buffer
      else if (file.isBuffer()) {
        file.contents = new Buffer(
          external(
            type,
            file.contents.toString(),
            name
          )
        );
      }

      // File is stream
      // TODO: support streams
      else if (file.isStream()) {
        return this.emit('error',
          new PluginError(PLUGIN_NAME,  'Streaming not supported'));
      }

      this.push(file);
      return callback();
    });

    // Returning the stream
    return stream;
  }
}

bookmarklet.template = makeExternalTask('templates');
bookmarklet.stylesheet = makeExternalTask('stylesheets');

// Helper to start from a blank stream
bookmarklet.blank = function(filename) {
  var src = stream.Readable({objectMode: true});

  // Override
  src._read = function() {

    // Pushing new file
    this.push(new File({
      cwd: '',
      base: '',
      path: filename || 'artoo.bookmark.js',
      contents: new Buffer('')
    }));
    this.push(null);
  };

  return src;
};

// Version
Object.defineProperty(bookmarklet, 'version', {
  value: '0.1.0'
});

// Exporting
module.exports = bookmarklet;
