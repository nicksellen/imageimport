import ExifParser from 'exif-parser';
import fs from 'fs';
import mkdirp from 'mkdirp';
import {basename, dirname, resolve} from 'path';

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

walk(src, (err, paths) => {
  if (err) return console.error(err);
  paths.filter(path => {
    return /\.jpg$/i.test(path);
  }).forEach(copy);
});

function copy(path) {
  fs.readFile(path, (err, buffer) => {
    if (err) return console.error(err);
    try {
      let exif = ExifParser.create(buffer).parse();
      if (!exif.tags.DateTimeOriginal) {
        console.log('missing-date', path);
        return;
      }
      let date = new Date(exif.tags.DateTimeOriginal * 1000);
      let d = zeroFill(date.getDate(), 2);
      let m = zeroFill(date.getMonth() + 1, 2);
      let y = date.getFullYear();
      let destPath = [dest, y, `${y}-${m}-${d}`, basename(path)].join('/');
      fs.exists(destPath, exists => {
        if (exists) return console.log('exists', destPath);
        mkdirp(dirname(destPath), err => {
          if (err) return console.error(err);
          fs.writeFile(destPath, buffer, err => {
            if (err) return console.error(err);
            console.log('copied', destPath);
          });
        });
      });
    } catch (e) {
      console.error('error', path);
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
