/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *  strict-local
 * @format
 */
'use strict';

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _objectSpread2 = _interopRequireDefault(require("@babel/runtime/helpers/objectSpread"));

var CompilerContext = require("./GraphQLCompilerContext");

var IRTransformer = require("./GraphQLIRTransformer");

var getLiteralArgumentValues = require("./getLiteralArgumentValues");

var getNormalizationOperationName = require("./getNormalizationOperationName");

var _require = require("./GraphQLSchemaUtils"),
    getRawType = _require.getRawType;

var _require2 = require("./RelayCompilerError"),
    createUserError = _require2.createUserError;

var _require3 = require("graphql"),
    assertObjectType = _require3.assertObjectType,
    isObjectType = _require3.isObjectType,
    GraphQLObjectType = _require3.GraphQLObjectType,
    GraphQLScalarType = _require3.GraphQLScalarType,
    GraphQLInterfaceType = _require3.GraphQLInterfaceType,
    GraphQLUnionType = _require3.GraphQLUnionType,
    GraphQLList = _require3.GraphQLList,
    GraphQLString = _require3.GraphQLString,
    getNullableType = _require3.getNullableType;

var SUPPORTED_ARGUMENT_NAME = 'supported';
var JS_FIELD_TYPE = 'JSDependency';
var JS_FIELD_ARG = 'module';
var JS_FIELD_NAME = 'js';
var SCHEMA_EXTENSION = "\n  directive @match on FIELD\n\n  directive @module(\n    name: String!\n  ) on FRAGMENT_SPREAD\n";
/**
 * This transform rewrites LinkedField nodes with @match and rewrites them
 * into `LinkedField` nodes with a `supported` argument.
 */

function relayMatchTransform(context) {
  return IRTransformer.transform(context, {
    // TODO: type IRTransformer to allow changing result type
    FragmentSpread: visitFragmentSpread,
    LinkedField: visitLinkedField,
    InlineFragment: visitInlineFragment,
    ScalarField: visitScalarField
  }, function (node) {
    return node.type;
  });
}

function visitInlineFragment(node, state) {
  return this.traverse(node, node.typeCondition);
}

function visitScalarField(field, parentType) {
  if (field.name === JS_FIELD_NAME) {
    var context = this.getContext();
    var schema = context.serverSchema;
    var jsModuleType = schema.getType(JS_FIELD_TYPE);

    if (jsModuleType != null && jsModuleType instanceof GraphQLScalarType && getRawType(field.type).name === jsModuleType.name) {
      throw new createUserError("Direct use of the '".concat(JS_FIELD_NAME, "' field is not allowed, use ") + '@match/@module instead.', [field.loc]);
    }
  }

  return field;
}

function visitLinkedField(node, parentType) {
  var _transformedNode$alia;

  var transformedNode = this.traverse(node, node.type);
  var matchDirective = transformedNode.directives.find(function (directive) {
    return directive.name === 'match';
  });

  if (matchDirective == null) {
    return transformedNode;
  }

  var rawType = getRawType(parentType);

  if (!(rawType instanceof GraphQLInterfaceType || rawType instanceof GraphQLObjectType)) {
    throw createUserError("@match used on incompatible field '".concat(transformedNode.name, "'.") + '@match may only be used with fields whose parent type is an ' + "interface or object, got invalid type '".concat(String(parentType), "'."), [node.loc]);
  }

  var context = this.getContext();
  var currentField = rawType.getFields()[transformedNode.name];
  var supportedArg = currentField.args.find(function (_ref2) {
    var name = _ref2.name;
    return SUPPORTED_ARGUMENT_NAME;
  });
  var supportedArgType = supportedArg != null ? getNullableType(supportedArg.type) : null;
  var supportedArgOfType = supportedArgType != null && supportedArgType instanceof GraphQLList ? supportedArgType.ofType : null;

  if (supportedArg == null || supportedArgType == null || supportedArgOfType == null || getNullableType(supportedArgOfType) !== GraphQLString) {
    throw createUserError("@match used on incompatible field '".concat(transformedNode.name, "'.") + '@match may only be used with fields that accept a ' + "'supported: [String!]!' argument.", [node.loc]);
  }

  var rawFieldType = getRawType(transformedNode.type);

  if (!(rawFieldType instanceof GraphQLUnionType) && !(rawFieldType instanceof GraphQLInterfaceType)) {
    throw createUserError("@match used on incompatible field '".concat(transformedNode.name, "'.") + '@match may only be used with fields that return a union or interface.', [node.loc]);
  }

  var seenTypes = new Map();
  var typeToSelectionMap = {};
  var selections = [];
  transformedNode.selections.forEach(function (matchSelection) {
    var moduleImport = matchSelection.kind === 'InlineFragment' ? matchSelection.selections[0] : null;

    if (matchSelection.kind !== 'InlineFragment' || moduleImport == null || moduleImport.kind !== 'ModuleImport') {
      throw createUserError('Invalid @match selection: all selections should be ' + 'fragment spreads with @module.', [matchSelection.loc, moduleImport === null || moduleImport === void 0 ? void 0 : moduleImport.loc].filter(Boolean));
    }

    var matchedType = matchSelection.typeCondition;
    var previousTypeUsage = seenTypes.get(matchedType);

    if (previousTypeUsage) {
      throw createUserError('Invalid @match selection: each concrete variant/implementor of ' + "'".concat(String(rawFieldType), "' may be matched against at-most once, ") + "but '".concat(String(matchedType), "' was matched against multiple times."), [matchSelection.loc, previousTypeUsage.loc]);
    }

    seenTypes.set(matchedType, matchSelection);
    var possibleConcreteTypes = rawFieldType instanceof GraphQLUnionType ? rawFieldType.getTypes() : context.clientSchema.getPossibleTypes(rawFieldType);
    var isPossibleConcreteType = possibleConcreteTypes.includes(matchedType);

    if (!isPossibleConcreteType) {
      var suggestedTypesMessage = 'but no concrete types are defined.';

      if (possibleConcreteTypes.length !== 0) {
        suggestedTypesMessage = "expected one of ".concat(possibleConcreteTypes.slice(0, 3).map(function (type) {
          return "'".concat(String(type), "'");
        }).join(', '), ", etc.");
      }

      throw createUserError('Invalid @match selection: selections must match against concrete ' + 'variants/implementors of type ' + "'".concat(String(transformedNode.type), "'. Got '").concat(String(matchedType), "', ") + suggestedTypesMessage, [matchSelection.loc, context.getFragment(moduleImport.name).loc]);
    }

    typeToSelectionMap[String(matchedType)] = {
      component: moduleImport.module,
      fragment: moduleImport.name
    };
    selections.push(matchSelection);
  });
  var stableArgs = [];
  Object.keys(typeToSelectionMap).sort().forEach(function (typeName) {
    var _typeToSelectionMap$t = typeToSelectionMap[typeName],
        component = _typeToSelectionMap$t.component,
        fragment = _typeToSelectionMap$t.fragment;
    stableArgs.push("".concat(fragment, ":").concat(component));
  });
  var storageKey = ((_transformedNode$alia = transformedNode.alias) !== null && _transformedNode$alia !== void 0 ? _transformedNode$alia : transformedNode.name) + "(".concat(stableArgs.join(','), ")");
  return {
    kind: 'LinkedField',
    alias: transformedNode.alias,
    args: [{
      kind: 'Argument',
      name: SUPPORTED_ARGUMENT_NAME,
      type: supportedArg.type,
      value: {
        kind: 'Literal',
        loc: node.loc,
        metadata: {},
        value: Array.from(seenTypes.keys()).map(function (type) {
          return type.name;
        })
      },
      loc: node.loc,
      metadata: {}
    }],
    directives: [],
    handles: null,
    loc: node.loc,
    metadata: {
      storageKey: storageKey
    },
    name: transformedNode.name,
    type: transformedNode.type,
    selections: selections
  };
} // Transform @module


function visitFragmentSpread(spread) {
  var _ref, _moduleDirective$args2;

  var transformedNode = this.traverse(spread);
  var moduleDirective = transformedNode.directives.find(function (directive) {
    return directive.name === 'module';
  });

  if (moduleDirective == null) {
    return transformedNode;
  }

  if (spread.args.length !== 0) {
    var _spread$args$;

    throw createUserError('@module does not support @arguments.', [(_spread$args$ = spread.args[0]) === null || _spread$args$ === void 0 ? void 0 : _spread$args$.loc].filter(Boolean));
  }

  var context = this.getContext();
  var schema = context.serverSchema;
  var jsModuleType = schema.getType(JS_FIELD_TYPE);

  if (jsModuleType == null || !(jsModuleType instanceof GraphQLScalarType)) {
    throw createUserError('Using @module requires the schema to define a scalar ' + "'".concat(JS_FIELD_TYPE, "' type."));
  }

  var fragment = context.getFragment(spread.name);

  if (!isObjectType(fragment.type)) {
    throw createUserError("@module used on invalid fragment spread '...".concat(spread.name, "'. @module ") + 'may only be used with fragments on a concrete (object) type, ' + "but the fragment has abstract type '".concat(String(fragment.type), "'."), [spread.loc, fragment.loc]);
  }

  var type = assertObjectType(fragment.type);
  var jsField = type.getFields()[JS_FIELD_NAME];
  var jsFieldArg = jsField ? jsField.args.find(function (arg) {
    return arg.name === JS_FIELD_ARG;
  }) : null;

  if (jsField == null || jsFieldArg == null || getNullableType(jsFieldArg.type) !== GraphQLString || jsField.type.name !== jsModuleType.name // object identity fails in tests
  ) {
      throw createUserError("@module used on invalid fragment spread '...".concat(spread.name, "'. @module ") + "requires the fragment type '".concat(String(fragment.type), "' to have a ") + "'".concat(JS_FIELD_NAME, "(").concat(JS_FIELD_ARG, ": String!): ").concat(JS_FIELD_TYPE, "' field ."), [moduleDirective.loc]);
    }

  if (spread.directives.length !== 1) {
    throw createUserError("@module used on invalid fragment spread '...".concat(spread.name, "'. @module ") + 'may not have additional directives.', [spread.loc]);
  }

  var _getLiteralArgumentVa = getLiteralArgumentValues(moduleDirective.args),
      moduleName = _getLiteralArgumentVa.name;

  if (typeof moduleName !== 'string') {
    var _moduleDirective$args;

    throw createUserError("Expected the 'name' argument of @module to be a literal string", [((_moduleDirective$args = moduleDirective.args.find(function (arg) {
      return arg.name === 'name';
    })) !== null && _moduleDirective$args !== void 0 ? _moduleDirective$args : spread).loc]);
  }

  var normalizationName = getNormalizationOperationName(spread.name) + '.graphql';
  var moduleField = {
    alias: '__module_component',
    args: [{
      kind: 'Argument',
      name: JS_FIELD_ARG,
      type: jsFieldArg.type,
      value: {
        kind: 'Literal',
        loc: (_ref = (_moduleDirective$args2 = moduleDirective.args[0]) === null || _moduleDirective$args2 === void 0 ? void 0 : _moduleDirective$args2.loc) !== null && _ref !== void 0 ? _ref : moduleDirective.loc,
        metadata: {},
        value: moduleName
      },
      loc: moduleDirective.loc,
      metadata: {}
    }],
    directives: [],
    handles: null,
    kind: 'ScalarField',
    loc: moduleDirective.loc,
    metadata: {
      storageKey: '__module_component'
    },
    name: JS_FIELD_NAME,
    type: jsModuleType
  };
  var fragmentField = {
    alias: '__module_operation',
    args: [{
      kind: 'Argument',
      name: JS_FIELD_ARG,
      type: jsFieldArg.type,
      value: {
        kind: 'Literal',
        loc: moduleDirective.loc,
        metadata: {},
        value: normalizationName
      },
      loc: moduleDirective.loc,
      metadata: {}
    }],
    directives: [],
    handles: null,
    kind: 'ScalarField',
    loc: moduleDirective.loc,
    metadata: {
      storageKey: '__module_operation'
    },
    name: JS_FIELD_NAME,
    type: jsModuleType
  };
  return {
    kind: 'InlineFragment',
    directives: [],
    loc: moduleDirective.loc,
    metadata: null,
    selections: [{
      kind: 'ModuleImport',
      loc: moduleDirective.loc,
      module: moduleName,
      name: spread.name,
      selections: [(0, _objectSpread2["default"])({}, spread, {
        directives: spread.directives.filter(function (directive) {
          return directive !== moduleDirective;
        })
      }), fragmentField]
    }, moduleField],
    typeCondition: fragment.type
  };
}

module.exports = {
  SCHEMA_EXTENSION: SCHEMA_EXTENSION,
  transform: relayMatchTransform
};