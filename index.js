#!/usr/bin/node

var fs = require('fs');

fs.exists(__dirname + '/src-es5', function(exists){
  if (exists) {
    require(__dirname + '/src-es5/index');
  } else {
    require('babel-core/register');
    require(__dirname + '/src/index');
  }
});
