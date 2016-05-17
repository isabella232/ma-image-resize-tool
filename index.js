var fs          = require('fs');
var path        = require('path');
var gm          = require('gm');
var imageMagick = gm.subClass({imageMagick: true});
var colors      = require('colors');
var _           = require('underscore');
var Q           = require('q');
var mkdirp      = require('mkdirp');
var execFile    = require('child_process').execFile;
var jpegtran    = require('jpegtran-bin');
var optipng     = require('optipng-bin');
var glob        = require("glob");

/**
 * @var {Object} settings - default values of configuration (will be used if no commandline parameters are given)
 */
var settings = {};
settings.LOAD_CONFIGS_FROM_FILES = true;
settings.CONFIG_DATA = null; // used only if LOAD_CONFIGS_FROM_FILES is false
settings.CONFIG_FILE = 'config.json';
settings.CONFIG_LOCAL_FILE = 'config-local.json';
settings.TAGS = ['all'];
settings.ALIASES = []; // ToDo: support setting aliases in parameters

/**
 * @var {Object} console utils
 */
var display = {};
display.success = function (str) {
    str = 'OK  '.green + str;
    console.log('  ' + str);
};
display.warning = function (str) {
    str = 'WARNING  '.yellow + str;
    console.log('  ' + str);
};
display.error = function (str) {
    str = 'ERROR  '.red + str;
    console.log('  ' + str);
};
display.info = function (str) {
    str = 'INFO  '.cyan + str;
    console.log('  ' + str);
};
display.header = function (str) {
    console.log('');
    console.log(' ' + str.cyan.underline);
    console.log('');
};

/**
 * Sets the configuration
 *
 * @param {string} configPath
 * @param {string} configLocalPath
 * @param {string} tags
 */
var configure = function( configPath, configLocalPath, tags )
{
    settings.CONFIG_FILE = (typeof configPath != "undefined" && configPath != null ) ? configPath : settings.CONFIG_LOCAL_FILE;
    settings.CONFIG_LOCAL_FILE = (typeof configLocalPath != "undefined" && configLocalPath != null ) ? configLocalPath : settings.CONFIG_LOCAL_FILE;
    settings.TAGS = (typeof tags != "undefined" && tags != null ) ? tags.split(",") : settings.CONFIG_LOCAL_FILE;
    settings.LOAD_CONFIGS_FROM_FILES = true;
}

/**
 * Sets the configuration data directly.
 *
 * @param {Object} configPath
 * @param {Object} configLocalPath
 * @param {string} tags
 */
var configureWithData = function( configData, configLocalData, tags )
{
    settings.CONFIG_DATA = _.extend( {}, configData, configLocalData || {} );
    settings.TAGS = (typeof tags != "undefined" && tags != null ) ? tags.split(",") : settings.CONFIG_LOCAL_FILE;
    settings.LOAD_CONFIGS_FROM_FILES = false;

}

/**
 * Read commandline parameters into settings.
 *
 * @param  {Array} argv
 * @param  {Object} settings
 * @return {Promise} resolves to an object{} - settings
 */
var readParameters = function (argv, settings)
{
    argv.forEach(function (val, index, array)
    {
        if( index > 1 && index%2 != 0) // index 3,5,7, ...
        {
            // --config
            if( argv[index-1] == "--config" || argv[index-1] == "-config" || argv[index-1] == "config" )
            {
                settings.CONFIG_FILE = argv[index];
            }

            // --config-local
            if( argv[index-1] == "--config-local" || argv[index-1] == "-config-local" || argv[index-1] == "config-local" )
            {
                settings.CONFIG_LOCAL_FILE = argv[index];
            }

            // --tags
            if( argv[index-1] == "--tags" || argv[index-1] == "-tags" || argv[index-1] == "tags" )
            {
                settings.TAGS = argv[index].split(",");
            }

            // --alias
            /** ToDo
             if( argv[index-1] == "--alias" || argv[index-1] == "-alias" || argv[index-1] == "alias" )
             {
                 settings.ALIASES.push(argv[index]);
             }
             */
        }
    });

    // log used settings
    console.log("  Settings: ");
    Object.keys(settings).forEach(function(key) {
        console.log( "   - " + key + ": " + settings[key] );
    });
    console.log("  Current working dir is:\n   - " + process.cwd());

    var deferred = Q.defer();
    deferred.resolve(settings);

    return deferred.promise;
};

/**
 * Checks if a config.json file exists
 *
 * @return {Promise} resolves if exists, rejects otherwise
 */
var configFileExists = function ()
{
    var deferred = Q.defer();
    if( settings.LOAD_CONFIGS_FROM_FILES == true )
    {
        console.log("\n  Loading configs: ");

        fs.exists(settings.CONFIG_FILE, function (exists) {
            if (exists) {
                display.success(settings.CONFIG_FILE + ' exists');
                deferred.resolve();
            } else {
                display.error(settings.CONFIG_FILE + ' does not exist in "'+process.cwd()+'".');
                deferred.reject();
            }
        });
    }
    else
    {
        deferred.resolve();
    }

    return deferred.promise;
};

/**
 * Checks if a config-local.json file exists
 *
 * @return {Promise} resolves if exists, rejects otherwise
 */
var configLocalFileExists = function ()
{
    var deferred = Q.defer();
    if( settings.LOAD_CONFIGS_FROM_FILES == true )
    {
        fs.exists(settings.CONFIG_LOCAL_FILE, function (exists) {
            if (exists) {
                display.success(settings.CONFIG_LOCAL_FILE + ' exists');
                deferred.resolve();
            } else {
                display.info(settings.CONFIG_LOCAL_FILE + ' does not exist in "'+process.cwd()+'".');
                deferred.resolve();
            }
        });
    }
    else
    {
        deferred.resolve();
    }

    return deferred.promise;
};

/**
 * Read the config file.
 *
 * @return {Promise} resolves to an object{} - the content of config.json
 */
var readConfig = function ()
{
    var deferred = Q.defer();
    if( settings.LOAD_CONFIGS_FROM_FILES == true )
    {
        data = fs.readFile(settings.CONFIG_FILE, function (err, data) {
            if (err) {
                deferred.reject(err);
            }
            var config = JSON.parse(data);
            if(config === false || config == null)
            {
                deferred.reject("Parsing "+settings.CONFIG_FILE+" failed.");
            }
            else
            {
                display.success("Parsing "+settings.CONFIG_FILE+" succeeded.");
                deferred.resolve(config);
            }
        });
    }
    else
    {
        deferred.resolve(settings.CONFIG_DATA);
    }

    return deferred.promise;
};

/**
 * Read the config-local file.
 *
 * @param  {Object} config
 * @return {Promise} resolves to an object{} - the content of config-local.json
 */
var readConfigLocal = function (config)
{
    var deferred = Q.defer();
    if( settings.LOAD_CONFIGS_FROM_FILES == true )
    {
        fs.exists(settings.CONFIG_LOCAL_FILE, function (exists) {
            if (exists) {
                var data = fs.readFile(settings.CONFIG_LOCAL_FILE, function (err, data) {
                    if (err) {
                        deferred.reject(err);
                    }
                    var configLocal = JSON.parse(data);
                    if(configLocal === false || configLocal == null)
                    {
                        deferred.reject("Parsing "+settings.CONFIG_LOCAL_FILE+" failed.");
                    }
                    else
                    {
                        display.success("Parsing "+settings.CONFIG_LOCAL_FILE+" succeeded.");

                        // merge config and set basePath
                        var finalConfig = _.extend( {}, config, configLocal );

                        deferred.resolve( finalConfig );
                    }
                });
            }
            else
            {
                deferred.resolve( config );
            }
        });
    }
    else
    {
        deferred.resolve(settings.CONFIG_DATA);
    }

    return deferred.promise;
};

/**
 * Prepares the config for use (resolves basePath if not yet set, resolves aliases in aliases)
 * @param config
 * @returns {promise|*|exports.exports.currentlyUnhandled.promise|Q.promise}
 */
var prepareConfigs = function (config)
{
    var deferred = Q.defer();

    // set base path (if not set in config or local-config)
    if( config.basePath == null )
    {
        config.basePath = path.normalize(process.cwd() + path.sep + path.dirname(settings.CONFIG_FILE));
    }

    // log new working dir if available
    console.log("  Base dir for paths in config is:\n   - " + config.basePath);

    // remove comments from images
    config.images = _(config.images).filter( function(image){ return _.isObject(image); } );

    // remove comments from alaises
    config.aliases = _(config.aliases).filter( function(alias){ return _.isObject(alias); } );

    // resolve aliases in aliases
    _(config.aliases).forEach(function (alias, index, aliases) {
        _(aliases).forEach(function (alias) {
            aliases[index].path = aliases[index].path.split(alias.name).join(alias.path);
        });
    });

    deferred.resolve(config);

    return deferred.promise;
};

/**
 * Runs through all the images and econverts their (possible) glob path into real paths.
 *
 * @param  {Object} config
 * @return {Promise}
 */
var resolveImagePaths = function (config)
{
    console.log("\n  Resolving image paths...")
    var deferred = Q.defer();
    var sequence = Q();
    var all = [];

    // use glob to expand paths (also filter those with not matching tags while we are at it)
    var images = [];
    _(config.images)
        .filter( function(image){ return _.isObject(image); } )
        .filter( function(image){ return _(image.tags.split(",")).intersection(settings.TAGS).length > 0 ? image : false; } )
        .forEach(function (image) {
            all.push( resolveAliasedImagePaths( image, config ).then( function(value){
                images = images.concat( value );
                return Q.defer().resolve(value);
            } ) )
        });


    Q.allSettled(all).then(function () {
        deferred.resolve( {"images" : images, "config" : config} );
    });

    return deferred.promise;
};

/**
 * Convert an images' path with aliases into real image paths.
 *
 * @param  {Object} image
 * @param  {Object} config
 * @return {Promise}
 */
var resolveAliasedImagePaths = function (image, config)
{
    var deferred = Q.defer();
    var images = [];

    // get all aliases which are in sourcePath ordered by their occurrence
    var aliases = _.chain(config.aliases)
        .filter( function (alias) {
            return image.sourcePath.indexOf( alias.name ) != -1;
        })
        .sortBy(function (alias) {
            return image.sourcePath.indexOf( alias.name );
        }).value();
    // group those aliases
    if( aliases.length > 0 )
    {
        var aliaseGroups = _.groupBy(aliases, function(alias){ return alias.name; });
        var firstAliasGroup = aliaseGroups[aliases[0].name];
        var allPromises = [];
        // ToDo: support multiple aliases in sourcePath
        // Only the first alias will be expanded and tested
        _(firstAliasGroup).forEach( function(alias){
            // Create a copy of config with the alias of the first group as first alias.
            // We rely on the fact that the first alias will overwrite all identical aliases after it.
            var newConfig = _.extend({}, config);
            newConfig.aliases = [alias].concat( config.aliases );
            allPromises.push( resolveImagePath( image, newConfig).then( function(value){
                // add found images to images array
                images = images.concat(value);
            }) );
        });

        Q.allSettled(allPromises).then(function (){
            // remove duplicates (paths with equal filename in sourcePath are considered duplicate)
            images.reverse(); // _.unique keeps the first found value but we want the last to be kept, thus we reverse it.
            images = _.unique(images, false, function(img){ return path.basename(img.sourcePath) });
            images.reverse();
            // return images list result
            deferred.resolve( images );
        });
    }
    else
    {
        // image without aliases in sourcePath
    }

    return deferred.promise;
};

/**
 * Convert an images' glob (https://github.com/isaacs/node-glob) into real paths.
 *
 * @param  {Object} image
 * @param  {Object} config
 * @return {Promise}
 */
var resolveImagePath = function (image, config)
{
    var deferred = Q.defer();
    var images = [];

    var basePath = config.basePath == null ? "" : config.basePath;
    // ensure ending slash
    basePath = basePath != "" && basePath.charAt(basePath.length-1) != "/" && basePath.charAt(basePath.length-1) != "\\" ? basePath + path.sep : basePath;
    basePath = path.normalize(basePath);

    // source path
    var sourcePath = basePath + image.sourcePath;
    // replace aliases
    _(config.aliases).forEach(function (alias) {
        sourcePath = sourcePath.split(alias.name).join(alias.path);
    });
    sourcePath = path.normalize(sourcePath);

    // target path
    var targetPath = basePath + image.targetPath;
    // replace aliases
    _(config.aliases).forEach(function (alias) {
        targetPath = targetPath.split(alias.name).join(alias.path);
    });
    targetPath = path.normalize(targetPath);

    // glob options (all glob paths have to use forward slashes)
    var options = {
        "cwd"  : basePath.split("\\").join("/"),
        "root" : basePath.split("\\").join("/")
    }

    // use glob to expand paths (each path results in a copy of the image)
    sourcePath = sourcePath.split("\\").join("/"); // all glob paths have to use forward slashes
    glob(sourcePath, options, function (error, files)
    {
        if( files != null )
        {
            _(files).forEach(function(file){
                // copy the existing image
                var newImage = _.extend( {}, image );
                // set de-globbed source path
                newImage.sourcePath = file;
                // resolve *.ext in target paths
                var tmpTargetPath = targetPath;
                var starExtension = tmpTargetPath.match(/(\*\.[a-zA-z0-9]+$)/g);
                if( starExtension != null && starExtension.length == 1 )
                {
                    starExtension = starExtension[0];
                    tmpTargetPath = path.parse(tmpTargetPath).dir + path.sep + path.parse(file).name + starExtension.replace("\*","");
                }
                newImage.targetPath = tmpTargetPath;
                // add new image
                images.push( newImage );
            })

            deferred.resolve( images );
        }
        else
        {
            display.error( error );
            deferred.reject(error);
        }
    });

    return deferred.promise;
};

/**
 * Runs through all the images and resizes them.
 *
 * @param  {Object} with keys "images" and "config"
 * @return {Promise}
 */
var generateImages = function (imagesAndConfig)
{
    console.log("\n  Resizing images: ");

    var images = imagesAndConfig.images;
    var config = imagesAndConfig.config;

    var deferred = Q.defer();
    var sequence = Q();
    var all = [];

    if( images.length > 0 )
    {
        _(images).forEach(function (image){
            sequence = sequence.then(function () {
                return generateImage(image, config);
            });
            all.push(sequence);
        });

        Q.allSettled(all).then(function () {
            deferred.resolve();
        });
    }
    else
    {
        console.log("  \n    No images matching the tags '"+settings.TAGS.join(",")+"' found.");
        deferred.resolve();
    }

    return deferred.promise;
};

/**
 * Resizes and creates a new icon in the platform's folder.
 *
 * @param  {Object} image entry from config
 * @param  {Object} the whole config (used to extract aliases)
 * @return {Promise}
 */
var generateImage = function (image, config)
{
    // size
    var _wh = image.resolution.split("x");
    var width = _wh[0];
    var height = _wh[1];

    return makeDir(image.targetPath)
        .then( function(){ return fileExists(image.sourcePath); } )
        .then( function(){ return resizeImage(image, config); } )
        .then( function(){
            if( image.optimize == null || ( image.optimize != "false" && image.optimize != false ) )
            {
                return optimizeImage(image.targetPath, config);
            }
            else
            {
                return true;
            }
        })
        .catch(function (error) {
            display.error(error);
            // warn the user (hint: you should make sure the parent sequence uses Q.allSettled())
            display.warning('Source image "' + image.sourcePath + '" does not exist.');
        });
};

/**
 * Resizes and image with imagemagic.
 * Depends on the "gm" node module.
 *
 * @param  {string} filePath
 * @param  {object} config
 * @return {Promise}
 */
var resizeImage = function (image, config)
{
    var deferred = Q.defer();

    // size
    var _wh = image.resolution.split("x");
    var width = _wh[0];
    var height = _wh[1];
    var sourcePath = image.sourcePath;
    var targetPath = image.targetPath;

    // Create empty image file (ImageMagic sometimes writes broken png data if the file does not
    // yet exist - I honestly don´t know why).
    fs.closeSync(fs.openSync(targetPath, 'w'));
    // create image
    var newImage = imageMagick(sourcePath);
    // apply quality
    if( image.quality !== null )
    {
        newImage.quality( image.quality );
    }
    // apply options
    var options = null;
    if( typeof config.options != "undefined" && config.options !== null )
    {
        options = _.extend( options || {}, config.options );
    }
    if( typeof image.options != "undefined" && image.options !== null )
    {
        options = _.extend( options || {}, image.options );
    }
    if( options !== null )
    {
        Object.keys(options).forEach(function(key) {
            try
            {
                console.log( "  -option '" + key + "': '" + (options[key]||[]).join(",") + "'" );
                if( typeof newImage[key] != "undefined" )
                {
                    newImage[key].apply(newImage, options[key] || []);
                }
            }
            catch( e )
            {
                display.warning("Option '" + key + "': " + e.message);
            }
        });
    }
    // resize (proportionally or not)
    if( image.proportional != null && (image.proportional == "true" || image.proportional === true) )
    {
        newImage.resize(width, height);
    }
    else
    {
        newImage.resizeExact(width, height);
    }
    newImage.write(targetPath, function(err) {
        if (err)
        {
            display.error(err);
            deferred.resolve();
        } else {
            deferred.resolve();
            display.success(targetPath + ' ('+image.resolution+') created');
        }
    });
    return deferred.promise;
}

/**
 * Optimizes a png file with optipng and a jpeg file with jpegtran.
 * Depends on optipng-bin (https://github.com/imagemin/optipng-bin)
 * and jpegtran-bin (https://github.com/imagemin/jpegtran-bin).
 *
 * @param  {string} filePath
 * @param  {object} config
 * @return {Promise}
 */
var optimizeImage = function (filePath, config)
{
    var deferred = Q.defer();

    fs.exists(filePath, function (exists)
    {
        switch( path.extname(filePath).toLowerCase() )
        {
            case ".png":
                if( config.optimize && config.optimize.optipng != null && config.optimize.optipng !== false )
                {
                    var parameters = [];
                    if( config.optimize.optipng.length > 0 )
                    {
                        parameters = config.optimize.optipng.split(" ");
                    }
                    parameters = parameters.concat(['-out', filePath, filePath]);
                    execFile(optipng, parameters, function (err) {
                        if( err != null )
                        {
                            display.error('optipng ' + parameters.join(" "));
                            display.error(err);
                        }
                        else
                        {
                            console.log('    Image optimized with: "optipng ' + config.optimize.optipng + ' -out ..."');
                        }
                        deferred.resolve();
                    });
                }
                break;
            case ".jpg":
            case ".jpeg":
                if( config.optimize && config.optimize.jpgtran != null && config.optimize.jpgtran !== false )
                {
                    var parameters = [];
                    if( config.optimize.jpgtran.length > 0 )
                    {
                        parameters = config.optimize.jpgtran.split(" ");
                    }
                    parameters = parameters.concat(['-outfile', filePath, filePath]);
                    execFile(jpegtran, parameters, function (err) {
                        if( err != null )
                        {
                            display.error('jpegtran ' + parameters.join(" "));
                            display.error(err);
                        }
                        else
                        {
                            console.log('    Image optimized with: "jpegtran ' + config.optimize.jpgtran + ' -outfile ..."');
                        }
                        deferred.resolve();
                    });
                }
                break;
            default:
                deferred.resolve();
        }
    });

    return deferred.promise;
};

/**
 * Checks if a file exists.
 *
 * @param  {string} filePath
 * @return {Promise}
 */
var fileExists = function (filePath)
{
    var deferred = Q.defer();

    fs.exists(filePath, function (exists)
    {
        if (exists) {
            deferred.resolve();
        } else {
            deferred.reject();
        }
    });
    return deferred.promise;
};

/**
 * Removes the filename from path and creates the directories if they don´t exist.
 * Depends on mkdirp (https://github.com/substack/node-mkdirp).
 *
 * @param  {Object} filePath
 * @return {Promise}
 */
var makeDir = function (filePath)
{
    var deferred = Q.defer();

    // get base path of target file
    filePath = path.dirname(filePath);

    mkdirp(filePath, function (error, made)
    {
        if( error == null ){
            if( made != null )
            {
                console.log("    Created new directory '"+made+"'.");
            }
            deferred.resolve();
        } else {
            display.error("    Could not create target directory '"+filePath+"'.");
            deferred.reject(error.message);
        }
    });

    return deferred.promise;
};

var run = function()
{

    display.header('Creating Images');

    return readParameters(process.argv, settings)
        .then(configFileExists)
        .then(configLocalFileExists)
        .then(readConfig)
        .then(readConfigLocal)
        .then(prepareConfigs)
        .then(resolveImagePaths)
        .then(generateImages)
        .catch(function (err) {
            if (err) {
                console.log(err);
            }
        }).then(function () {
            console.log('');
        });
};

module.exports = {
    run: run,
    configure: configure,
    configureWithData: configureWithData
};
