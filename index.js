var fs = require('fs');

fs.exists('./src-es5', function(exists){
  if (exists) {
    require('./src-es5/index');
  } else {
    require('babel-core/register');
    require('./src/index');
  }
});
