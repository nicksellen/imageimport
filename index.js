#!/usr/bin/env node

const fastExif = require('fast-exif')
const fs = require('fs')
const { ensureDir, copy: fsCopy } = require('fs-extra')
const async = require('async')
const filesize = require('filesize')
const { basename, resolve, join } = require('path')

let src = process.argv[2]
let dest = process.argv[3]

let INCLUDE_RE = /\.jpe?g$/i

if (!src || !dest) {
  console.log('Usage:', process.argv[1], '<src> <dest>')
  process.exit(0)
}

src = src.replace(/\/$/, '')
dest = dest.replace(/\/$/, '')

let srcIsDir = isDirectorySync(src)
let destIsDir = isDirectorySync(dest)

if (!srcIsDir || !destIsDir) {
  if (!srcIsDir) console.log(src, 'is not a directory')
  if (!destIsDir) console.log(dest, 'is not a directory')
  process.exit(1)
}

let take = createThing(20)

start()

function start () {
  collectDestFiles((err, destFiles) => {
    if (err) return console.error(err)
    collectSrcFiles((err, srcFiles) => {
      if (err) return console.error(err)
      srcFiles.forEach(srcPath => {
        take(done => {
          function handleError (err) {
            if (err) return console.log('error', srcPath, err.message)
            done()
          }
          fastExif.read(srcPath)
            .then(data => {
              let DateTimeOriginal = data.exif.DateTimeOriginal
              if (DateTimeOriginal) {
                let filename = basename(srcPath)
                let destDirRel = formatDateDir(new Date(DateTimeOriginal))
                let destDir = join(dest, destDirRel)
                let destPath = join(destDir, filename)
                let destPathRel = join(destDirRel, filename)
                let existingFile = destFiles[destPathRel]
                if (existingFile) {
                  // console.log('exists', destPathRel)
                  fs.stat(srcPath, (err, stat) => {
                    if (err) return handleError(err)
                    if (stat.size !== existingFile.size) {
                      if (Math.abs(stat.size - existingFile.size) > 10000) {
                        console.log(
                          'sizediff',
                          'src:', stat.size, '(' + filesize(stat.size) + ')', srcPath,
                          'dest:', existingFile.size, '(' + filesize(existingFile.size) + ')', destPath
                        )
                      }
                    }
                    done()
                  })
                } else {
                  console.log('new', destPathRel)
                  ensureDir(destDir, err => {
                    if (err) return handleError(err)
                    fsCopy(srcPath, destPath, { overwrite: false, errorOnExist: true }, err => {
                      if (err) return handleError(err)
                      console.log('copied', destPathRel)
                      done()
                    })
                  })
                }
              } else {
                console.error('missingdate', srcPath)
                done()
              }
            })
            .catch(handleError)
        })
      })
    })
  })
}

function collectDestFiles (callback) {
  walk(dest, (err, paths) => {
    if (err) return callback(err)
    let files = {}
    async.map(paths, (path, callback) => {
      if (!INCLUDE_RE.test(path)) return callback()
      fs.stat(path, (err, stat) => {
        if (err) return callback(err)
        let relativePath = path.substring(dest.length + 1)
        files[relativePath] = {
          stat,
          size: stat.size,
          filename: basename(path)
        }
        callback()
      })
    }, err => {
      if (err) return callback(err)
      callback(null, files)
    })
  })
}

function collectSrcFiles (callback) {
  walk(src, (err, paths) => {
    if (err) return callback(err)
    callback(null, paths.filter(path => {
      return INCLUDE_RE.test(path)
    }))
  })
}

function formatDateDir (date) {
  let d = zeroFill(date.getDate(), 2)
  let m = zeroFill(date.getMonth() + 1, 2)
  let y = date.getFullYear()
  return [y, `${y}-${m}-${d}`].join('/')
}

function zeroFill (number, width) {
  width -= number.toString().length
  if (width > 0) {
    return new Array(width + (/\./.test(number) ? 2 : 1)).join('0') + number
  }
  return number + '' // always return a string
}

// http://stackoverflow.com/a/5827895/2922612
function walk (dir, done) {
  let results = []
  fs.readdir(dir, (err, list) => {
    if (err) return done(err)
    let pending = list.length
    if (!pending) return done(null, results)
    function handleError (err) {
      console.error(err)
      if (!--pending) done(null, results)
    }
    list.forEach(file => {
      file = resolve(dir, file)
      fs.stat(file, (err, stat) => {
        if (err) return handleError(err)
        if (stat && stat.isDirectory()) {
          walk(file, (err, res) => {
            if (err) return handleError(err)
            results = results.concat(res)
            if (!--pending) done(null, results)
          })
        } else {
          results.push(file)
          if (!--pending) done(null, results)
        }
      })
    })
  })
};

function isDirectorySync (path) {
  try {
    return fs.statSync(path).isDirectory()
  } catch (e) {
    return false
  }
}

function createThing (n) {
  let active = 0

  let fns = []

  function onDone () {
    active--
    next()
  }

  function next () {
    if (active < n && fns.length > 0) {
      active++
      let fn = fns[0]
      fns.splice(0, 1)
      fn(onDone)
      next()
    }
  }

  return fn => {
    fns.push(fn)
    next()
  }
}
