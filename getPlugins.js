// This script takes the npm cache and outputs etherpad plugins

//var npm = require("npm");
var request = require('request');
var fs = require('fs');
var cmd=require('node-cmd');
var jsonDiff = require('json-diff');

const ignoredPlugins = {
  'ep_etherpad-lite': true,
  'ep_imageconvert': true,
  'ep_brightcolorpicker': true,
  'ep_historicalsearch': true,
  'ep_simpletextsearch': true,
}

/*

Run by doing:

cd tools
npm install npm
node getPlugins.js > ../plugins.json

*/

/*
npm.load({}, function (er) {
  if (er) console.error(er);
console.log(npm.commands);
  npm.commands.search(['ep_'], function(er, results) {
//    console.log(results);

    var plugins = results;
    if(er) console.error(er);
    for (result in results){
console.log(result);
      // console.log(results[result].name.substring(0,3));
      // Delete non plugins
      if(results[result].name.substring(0,3) !== "ep_" || !results[result].description){
        delete plugins[result];
        console.log("deleting", result);
      }
    };
    var pluginCount = Object.keys(plugins).length
    if (pluginCount > 30) {
      saveData(JSON.stringify(plugins));
    } else {
      console.log('plugin list too small: '+pluginCount);
    }
    //console.log(JSON.stringify(plugins));
  })
});
*/

var plugins = {};

/*
cmd.get('npm search --parseable=true etherpad', function(err, data, stderr) {
  var lines = data.split(/\r?\n/);
console.log(lines);

  var done = 1;
  for (var i=done; i < lines.length; i++) {
    var line = lines[i];
    var name = line.substr(0, line.indexOf('\t'));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    loadPluginInfo(name, function() {
      done++;
      if (done == lines.length) {
        saveData(JSON.stringify(plugins));
      }
    });
  }
});
*/


const names = require("all-the-package-names");

//var names = ['ep_message_all', 'ep_page_view'];
async function loadList() {

  let package_names = [];
  for (let key in names) {
  //names.forEach(function(name) {
    if (names[key].substring(0,3) == 'ep_') {
      package_names.push(names[key]);

      //await loadPluginInfo(names[key]);
    }
  }

  return package_names;
}

function loadPluginInfo(name) {
console.log('Load info for: ' + name);
  var options = {
    url: 'https://www.npmjs.com/search/suggestions?q='+name,
    json: true
  }

  return new Promise(function (resolve, reject) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    request(options, function(error, response, body) {
      if (error) {
        console.log(error, response);
        return reject();
      }
      for (key in body) {
        var package = body[key];
        if (!package.name) {
          console.log('Package has no name: ', package);
        } else if (package.name.substring(0,3) == 'ep_') {
          package.time = (new Date(package.date)).toISOString().split('T')[0];
          plugins[package.name] = package;
        }
      }
      resolve();
    });
  });
}

var saveData = function(data) {
  let rawdata = fs.readFileSync('/var/www/etherpad-static/plugins.json');
  let persistedData = JSON.parse(rawdata);

  let persistedDataLength = Object.keys(persistedData).length;
  let newDataLength = Object.keys(data).length;

  if (persistedDataLength <= newDataLength) {
    let diff = jsonDiff.diffString(persistedData, data);
    if (diff != '') {
      console.log(diff);
      console.log('new length: ' + newDataLength);
      console.log('Saving new plugins.json file');
      fs.writeFileSync("/var/www/etherpad-static/plugins-" + getCurrentDate() + '.json', rawdata);
      fs.writeFileSync("/var/www/etherpad-static/plugins.json", JSON.stringify(data));
    }
    return;
  }

  console.log('new data have fewer entries: ' + newDataLength + '/' + persistedDataLength);

}

/*
function validJSON(string) {
  try {
    JSON.parse(string);
    return true;
  } catch(e) {
    return false;
  }
}
*/


var getCurrentDate = function(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}

var randomProperty = function (obj) {
    var keys = Object.keys(obj);
    return keys[ keys.length * Math.random() << 0];
};



async function main() {
  let rawdata = fs.readFileSync('/var/www/etherpad-static/plugins.json');
  plugins = JSON.parse(rawdata);

  let newPackageList = await loadList();

  for (let i=0; i < newPackageList.length; i++) {
    if (!(newPackageList[i] in plugins) && !(newPackageList[i] in ignoredPlugins)) {
      console.log('new package: ' + newPackageList[i]);
      await loadPluginInfo(newPackageList[i]);
    }
  }

  for (let i=0; i < 20; i++) {
    await loadPluginInfo(randomProperty(plugins));
  }

  saveData(plugins);

}

main();
