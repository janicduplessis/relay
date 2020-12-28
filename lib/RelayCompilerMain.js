/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 * @format
 */
'use strict';

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _asyncToGenerator = require("@babel/runtime/helpers/asyncToGenerator");

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _toConsumableArray2 = _interopRequireDefault(require("@babel/runtime/helpers/toConsumableArray"));

require("@babel/polyfill");

var CodegenRunner = require("./CodegenRunner");

var ConsoleReporter = require("./GraphQLConsoleReporter");

var DotGraphQLParser = require("./DotGraphQLParser");

var WatchmanClient = require("./GraphQLWatchmanClient");

var RelaySourceModuleParser = require("./RelaySourceModuleParser");

var RelayFileWriter = require("./RelayFileWriter");

var RelayIRTransforms = require("./RelayIRTransforms");

var RelayLanguagePluginJavaScript = require("./RelayLanguagePluginJavaScript");

var crypto = require("crypto");

var fs = require("fs");

var path = require("path");

var _require = require("graphql"),
    buildASTSchema = _require.buildASTSchema,
    buildClientSchema = _require.buildClientSchema,
    parse = _require.parse,
    printSchema = _require.printSchema;

var commonTransforms = RelayIRTransforms.commonTransforms,
    codegenTransforms = RelayIRTransforms.codegenTransforms,
    fragmentTransforms = RelayIRTransforms.fragmentTransforms,
    printTransforms = RelayIRTransforms.printTransforms,
    queryTransforms = RelayIRTransforms.queryTransforms,
    schemaExtensions = RelayIRTransforms.schemaExtensions;

function buildWatchExpression(options) {
  return ['allof', ['type', 'f'], ['anyof'].concat((0, _toConsumableArray2["default"])(options.extensions.map(function (ext) {
    return ['suffix', ext];
  }))), ['anyof'].concat((0, _toConsumableArray2["default"])(options.include.map(function (include) {
    return ['match', include, 'wholename'];
  })))].concat((0, _toConsumableArray2["default"])(options.exclude.map(function (exclude) {
    return ['not', ['match', exclude, 'wholename']];
  })));
}

function getFilepathsFromGlob(baseDir, options) {
  var extensions = options.extensions,
      include = options.include,
      exclude = options.exclude;
  var patterns = include.map(function (inc) {
    return "".concat(inc, "/*.+(").concat(extensions.join('|'), ")");
  });

  var glob = require("fast-glob");

  return glob.sync(patterns, {
    cwd: baseDir,
    ignore: exclude
  });
}

/**
 * Unless the requested plugin is the builtin `javascript` one, import a
 * language plugin as either a CommonJS or ES2015 module.
 *
 * When importing, first check if it’s a path to an existing file, otherwise
 * assume it’s a package and prepend the plugin namespace prefix.
 *
 * Make sure to always use Node's `require` function, which otherwise would get
 * replaced with `__webpack_require__` when bundled using webpack, by using
 * `eval` to get it at runtime.
 */
function getLanguagePlugin(language) {
  if (language === 'javascript') {
    return RelayLanguagePluginJavaScript();
  } else {
    var pluginPath = path.resolve(process.cwd(), language);
    var requirePath = fs.existsSync(pluginPath) ? pluginPath : "relay-compiler-language-".concat(language);

    try {
      // eslint-disable-next-line no-eval
      var languagePlugin = eval('require')(requirePath);

      if (languagePlugin["default"]) {
        languagePlugin = languagePlugin["default"];
      }

      if (typeof languagePlugin === 'function') {
        return languagePlugin();
      } else {
        throw new Error('Expected plugin to export a function.');
      }
    } catch (err) {
      var e = new Error("Unable to load language plugin ".concat(requirePath, ": ").concat(err.message));
      e.stack = err.stack;
      throw e;
    }
  }
}

function main(_x) {
  return _main.apply(this, arguments);
}

function _main() {
  _main = _asyncToGenerator(function* (options) {
    var _parserConfigs;

    var schemaPath = path.resolve(process.cwd(), options.schema);

    if (!fs.existsSync(schemaPath)) {
      throw new Error("--schema path does not exist: ".concat(schemaPath));
    }

    var srcDir = path.resolve(process.cwd(), options.src);

    if (!fs.existsSync(srcDir)) {
      throw new Error("--src path does not exist: ".concat(srcDir));
    }

    var persistedQueryPath = options.persistOutput;

    if (typeof persistedQueryPath === 'string') {
      persistedQueryPath = path.resolve(process.cwd(), persistedQueryPath);
      var persistOutputDir = path.dirname(persistedQueryPath);

      if (!fs.existsSync(persistOutputDir)) {
        throw new Error("--persist-output path does not exist: ".concat(persistedQueryPath));
      }
    }

    if (options.watch && !options.watchman) {
      throw new Error('Watchman is required to watch for changes.');
    }

    if (options.watch && !hasWatchmanRootFile(srcDir)) {
      throw new Error("\n--watch requires that the src directory have a valid watchman \"root\" file.\n\nRoot files can include:\n- A .git/ Git folder\n- A .hg/ Mercurial folder\n- A .watchmanconfig file\n\nEnsure that one such file exists in ".concat(srcDir, " or its parents.\n    ").trim());
    }

    if (options.verbose && options.quiet) {
      throw new Error("I can't be quiet and verbose at the same time");
    }

    var reporter = new ConsoleReporter({
      verbose: options.verbose,
      quiet: options.quiet
    });
    var useWatchman = options.watchman && (yield WatchmanClient.isAvailable());
    var schema = getSchema(schemaPath);
    var languagePlugin = getLanguagePlugin(options.language);
    var inputExtensions = options.extensions || languagePlugin.inputExtensions;
    var outputExtension = languagePlugin.outputExtension;
    var sourceParserName = inputExtensions.join('/');
    var sourceWriterName = outputExtension;
    var sourceModuleParser = RelaySourceModuleParser(languagePlugin.findGraphQLTags);
    var providedArtifactDirectory = options.artifactDirectory;
    var artifactDirectory = providedArtifactDirectory != null ? path.resolve(process.cwd(), providedArtifactDirectory) : null;
    var generatedDirectoryName = artifactDirectory || '__generated__';
    var sourceSearchOptions = {
      extensions: inputExtensions,
      include: options.include,
      exclude: ['**/*.graphql.*'].concat((0, _toConsumableArray2["default"])(options.exclude)) // Do not include artifacts

    };
    var graphqlSearchOptions = {
      extensions: ['graphql'],
      include: options.include,
      exclude: [path.relative(srcDir, schemaPath)].concat(options.exclude)
    };
    var parserConfigs = (_parserConfigs = {}, (0, _defineProperty2["default"])(_parserConfigs, sourceParserName, {
      baseDir: srcDir,
      getFileFilter: sourceModuleParser.getFileFilter,
      getParser: sourceModuleParser.getParser,
      getSchema: function getSchema() {
        return schema;
      },
      watchmanExpression: useWatchman ? buildWatchExpression(sourceSearchOptions) : null,
      filepaths: useWatchman ? null : getFilepathsFromGlob(srcDir, sourceSearchOptions)
    }), (0, _defineProperty2["default"])(_parserConfigs, "graphql", {
      baseDir: srcDir,
      getParser: DotGraphQLParser.getParser,
      getSchema: function getSchema() {
        return schema;
      },
      watchmanExpression: useWatchman ? buildWatchExpression(graphqlSearchOptions) : null,
      filepaths: useWatchman ? null : getFilepathsFromGlob(srcDir, graphqlSearchOptions)
    }), _parserConfigs);
    var writerConfigs = (0, _defineProperty2["default"])({}, sourceWriterName, {
      writeFiles: getRelayFileWriter(srcDir, languagePlugin, options.noFutureProofEnums, artifactDirectory, persistedQueryPath),
      isGeneratedFile: function isGeneratedFile(filePath) {
        return filePath.endsWith('.graphql.' + outputExtension) && filePath.includes(generatedDirectoryName);
      },
      parser: sourceParserName,
      baseParsers: ['graphql']
    });
    var codegenRunner = new CodegenRunner({
      reporter: reporter,
      parserConfigs: parserConfigs,
      writerConfigs: writerConfigs,
      onlyValidate: options.validate,
      // TODO: allow passing in a flag or detect?
      sourceControl: null
    });

    if (!options.validate && !options.watch && useWatchman) {
      // eslint-disable-next-line no-console
      console.log('HINT: pass --watch to keep watching for changes.');
    }

    var result = options.watch ? yield codegenRunner.watchAll() : yield codegenRunner.compileAll();

    if (result === 'ERROR') {
      process.exit(100);
    }

    if (options.validate && result !== 'NO_CHANGES') {
      process.exit(101);
    }
  });
  return _main.apply(this, arguments);
}

function getRelayFileWriter(baseDir, languagePlugin, noFutureProofEnums, outputDir, persistedQueryPath) {
  return function (_ref) {
    var onlyValidate = _ref.onlyValidate,
        schema = _ref.schema,
        documents = _ref.documents,
        baseDocuments = _ref.baseDocuments,
        sourceControl = _ref.sourceControl,
        reporter = _ref.reporter;
    var persistQuery;
    var queryMap;

    if (persistedQueryPath != null) {
      queryMap = new Map();

      persistQuery = function persistQuery(text) {
        var hasher = crypto.createHash('md5');
        hasher.update(text);
        var id = hasher.digest('hex');
        queryMap.set(id, text);
        return Promise.resolve(id);
      };
    }

    var results = RelayFileWriter.writeAll({
      config: {
        baseDir: baseDir,
        compilerTransforms: {
          commonTransforms: commonTransforms,
          codegenTransforms: codegenTransforms,
          fragmentTransforms: fragmentTransforms,
          printTransforms: printTransforms,
          queryTransforms: queryTransforms
        },
        customScalars: {},
        formatModule: languagePlugin.formatModule,
        optionalInputFieldsForFlow: [],
        schemaExtensions: schemaExtensions,
        useHaste: false,
        noFutureProofEnums: noFutureProofEnums,
        extension: languagePlugin.outputExtension,
        typeGenerator: languagePlugin.typeGenerator,
        outputDir: outputDir,
        persistQuery: persistQuery
      },
      onlyValidate: onlyValidate,
      schema: schema,
      baseDocuments: baseDocuments,
      documents: documents,
      reporter: reporter,
      sourceControl: sourceControl
    });

    if (queryMap != null && persistedQueryPath != null) {
      var object = {};
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = queryMap.entries()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var _step$value = _step.value,
              key = _step$value[0],
              value = _step$value[1];
          object[key] = value;
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      var data = JSON.stringify(object, null, 2);
      fs.writeFileSync(persistedQueryPath, data, 'utf8');
    }

    return results;
  };
}

function getSchema(schemaPath) {
  try {
    var source = fs.readFileSync(schemaPath, 'utf8');

    if (path.extname(schemaPath) === '.json') {
      source = printSchema(buildClientSchema(JSON.parse(source).data));
    }

    source = "\n  directive @include(if: Boolean) on FRAGMENT_SPREAD | FIELD\n  directive @skip(if: Boolean) on FRAGMENT_SPREAD | FIELD\n\n  ".concat(source, "\n  ");
    return buildASTSchema(parse(source), {
      assumeValid: true
    });
  } catch (error) {
    throw new Error("\nError loading schema. Expected the schema to be a .graphql or a .json\nfile, describing your GraphQL server's API. Error detail:\n\n".concat(error.stack, "\n    ").trim());
  }
} // Ensure that a watchman "root" file exists in the given directory
// or a parent so that it can be watched


var WATCHMAN_ROOT_FILES = ['.git', '.hg', '.watchmanconfig'];

function hasWatchmanRootFile(testPath) {
  while (path.dirname(testPath) !== testPath) {
    if (WATCHMAN_ROOT_FILES.some(function (file) {
      return fs.existsSync(path.join(testPath, file));
    })) {
      return true;
    }

    testPath = path.dirname(testPath);
  }

  return false;
}

module.exports = {
  main: main
};