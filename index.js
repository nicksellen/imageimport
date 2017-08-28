const ExifParser = require('exif-parser');
const fs = require('fs');
const async = require('async');
const mkdirp = require('mkdirp');
const { basename, dirname, resolve } = require('path');

let src = process.argv[2];
let dest = process.argv[3];

if (!src || !dest) {
  console.log('Usage:', process.argv[1], '<src> <dest>');
  process.exit(0);
}

let srcIsDir = isDirectorySync(src);
let destIsDir = isDirectorySync(dest);

if (!srcIsDir || !destIsDir) {
  if (!srcIsDir) console.log(src, 'is not a directory');
  if (!destIsDir) console.log(dest, 'is not a directory');
  process.exit(1);
}

let take = createThing(20);

/*
* We list all dest files are get filename + size
* We assume they are unique, so won't import duplicate.
*/

walk(dest, (err, paths) => {
  if (err) return console.error(err);

  let existing = {};
  async.map(paths, (path, callback) => {
    fs.stat(path, (err, info) => {
      if (err) return callback(err);
      let filename = basename(path);
      if (!existing[filename]) existing[filename] = {};
      existing[filename][info.size] = true;
      callback();
    });
  }, err => {
    if (err) return console.error(err);

    function checkExists(filename, size, callback){
      let entry = existing[filename];
      callback(entry && entry[size]);
    }

    walk(src, (err, paths) => {
      if (err) return console.error(err);
      let completed = 0;
      paths.filter(path => {
        return /\.jpe?g$/i.test(path);// && basename(path) === 'DSC09521.JPG';
      }).forEach((path, i) => {
        take(done => {

          fs.stat(path, (err, statinfo) => {
            if (err) {
              console.error(err);
              done();
            } else {
              let filename = basename(path);
              checkExists(filename, statinfo.size, exists => {
                if (exists) {
                  // normal case don't need to log
                  // console.log('exists!', path);
                  done();
                } else {
                  copy(path, (err, info = {}) => {
                    if (err) {
                      console.log('error', path, err.message);
                    } else {
                      console.log(info.status, info.destDir);
                    }
                    done();
                    completed++;
                  });
                }
              });

            }
          });
        });
      });

    });
  });
});

function copy(path, callback) {
  fs.readFile(path, (err, buffer) => {
    if (err) return callback(err);
    try {
      let exif = ExifParser.create(buffer).parse();
      if (!exif.tags.DateTimeOriginal) {
        callback(new Error('missing-date ' + path));
        return;
      }
      let date = new Date(exif.tags.DateTimeOriginal * 1000);
      let d = zeroFill(date.getDate(), 2);
      let m = zeroFill(date.getMonth() + 1, 2);
      let y = date.getFullYear();
      let filename = basename(path);
      let destDir = [y, `${y}-${m}-${d}`, filename].join('/');
      let destPath = [dest, destDir].join('/');
      fs.exists(destPath, exists => {
        if (exists) {
          callback(null, { status: 'exists', srcPath: path, destPath, destDir, filename });
        } else {
          mkdirp(dirname(destPath), err => {
            if (err) return callback(err);
            fs.writeFile(destPath, buffer, err => {
            if (err) return callback(err);
              callback(null, { status: 'copied', srcPath: path, destPath, destDir, filename });
            });
          });
        }
      });
    } catch (e) {
      callback(e);
    }
  });
}

function zeroFill(number, width){
  width -= number.toString().length;
  if (width > 0) {
    return new Array( width + (/\./.test( number ) ? 2 : 1) ).join( '0' ) + number;
  }
  return number + ""; // always return a string
}

// http://stackoverflow.com/a/5827895/2922612
function walk(dir, done) {
  let results = [];
  fs.readdir(dir, (err, list) => {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(file => {
      file = resolve(dir, file);
      fs.stat(file, (err, stat) => {
        if (stat && stat.isDirectory()) {
          walk(file, (err, res) => {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

function isDirectorySync(path) {
  try {
    return fs.statSync(path).isDirectory();
  } catch (e) {
    return false;
  }
}

function createThing(n) {

  let active = 0;

  let fns = [];

  function onDone() {
    active--;
    next();
  }

  function next() {
    if (active < n && fns.length > 0) {
      active++;
      let fn = fns[0];
      fns.splice(0, 1);
      fn(onDone);
      next();
    }
  }

  return fn => {
    fns.push(fn);
    next();
  };
}
