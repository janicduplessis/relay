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

var _objectSpread2 = _interopRequireDefault(require("@babel/runtime/helpers/objectSpread"));

var _toConsumableArray2 = _interopRequireDefault(require("@babel/runtime/helpers/toConsumableArray"));

var IRTransformer = require('../core/IRTransformer');

var _require = require('../core/CompilerError'),
    createUserError = _require.createUserError;

var _require2 = require('./ConnectionTransform'),
    buildConnectionMetadata = _require2.buildConnectionMetadata;

var _require3 = require('relay-runtime'),
    ConnectionInterface = _require3.ConnectionInterface;

var SCHEMA_EXTENSION = "\n  directive @connection_resolver(label: String!) on FIELD\n  directive @stream_connection_resolver(\n    label: String!\n    initial_count: Int!\n    if: Boolean = true\n  ) on FIELD\n";

/**
 * This transform rewrites LinkedField nodes with @connection_resolver and
 * rewrites their edges/pageInfo selections to be wrapped in a Connection node.
 */
function connectionFieldTransform(context) {
  return IRTransformer.transform(context, {
    Fragment: visitFragmentOrRoot,
    LinkedField: visitLinkedField,
    Root: visitFragmentOrRoot,
    ScalarField: visitScalarField
  }, function (node) {
    return {
      documentName: node.name,
      labels: new Map(),
      path: [],
      connectionMetadata: []
    };
  });
}

function visitFragmentOrRoot(node, state) {
  var transformedNode = this.traverse(node, state);
  var connectionMetadata = state.connectionMetadata;

  if (connectionMetadata.length) {
    return (0, _objectSpread2["default"])({}, transformedNode, {
      metadata: (0, _objectSpread2["default"])({}, transformedNode.metadata, {
        connection: connectionMetadata
      })
    });
  }

  return transformedNode;
}

function visitLinkedField(field, state) {
  var context = this.getContext();
  var schema = context.getSchema();
  var path = state.path.concat(field.alias);
  var transformed = this.traverse(field, (0, _objectSpread2["default"])({}, state, {
    path: path
  }));
  var connectionDirective = transformed.directives.find(function (directive) {
    return directive.name === 'connection_resolver' || directive.name === 'stream_connection_resolver';
  });

  if (connectionDirective == null) {
    return transformed;
  }

  if (schema.isList(schema.getNullableType(transformed.type))) {
    throw createUserError("@connection_resolver fields must return a single value, not a list, found '" + "".concat(schema.getTypeString(transformed.type), "'"), [transformed.loc]);
  }

  var labelArg = connectionDirective.args.find(function (_ref4) {
    var name = _ref4.name;
    return name === 'label';
  });
  var label = getLiteralStringArgument(connectionDirective, 'label');

  if (typeof label !== 'string' || label !== state.documentName && label.indexOf(state.documentName + '$') !== 0) {
    var _ref;

    throw createUserError('Invalid usage of @connection_resolver, expected a static string ' + "'label'. Labels may be the document name ('".concat(state.documentName, "') ") + "or be prefixed with the document name ('".concat(state.documentName, "$<name>')"), [(_ref = labelArg === null || labelArg === void 0 ? void 0 : labelArg.loc) !== null && _ref !== void 0 ? _ref : connectionDirective.loc]);
  }

  var previousDirective = state.labels.get(label);

  if (previousDirective != null) {
    var _ref2;

    var prevLabelArg = previousDirective.args.find(function (_ref5) {
      var name = _ref5.name;
      return name === 'label';
    });
    var previousLocation = (_ref2 = prevLabelArg === null || prevLabelArg === void 0 ? void 0 : prevLabelArg.loc) !== null && _ref2 !== void 0 ? _ref2 : previousDirective.loc;

    if (labelArg) {
      throw createUserError('Invalid use of @connection_resolver, the provided label is ' + "not unique. Specify a unique 'label' as a literal string.", [labelArg === null || labelArg === void 0 ? void 0 : labelArg.loc, previousLocation]);
    } else {
      throw createUserError('Invalid use of @connection_resolver, could not generate a ' + "default label that is unique. Specify a unique 'label' " + 'as a literal string.', [connectionDirective.loc, previousLocation]);
    }
  }

  state.labels.set(label, connectionDirective);
  var stream = null;

  if (connectionDirective.name === 'stream_connection_resolver') {
    var initialCountArg = connectionDirective.args.find(function (arg) {
      return arg.name === 'initial_count';
    });
    var ifArg = connectionDirective.args.find(function (arg) {
      return arg.name === 'if';
    });

    if (initialCountArg == null || initialCountArg.value.kind === 'Literal' && !Number.isInteger(initialCountArg.value.value)) {
      var _ref3;

      throw createUserError("Invalid use of @connection_resolver, 'initial_count' is required " + "and must be an integer or variable of type 'Int!''.", [(_ref3 = initialCountArg === null || initialCountArg === void 0 ? void 0 : initialCountArg.loc) !== null && _ref3 !== void 0 ? _ref3 : connectionDirective.loc]);
    }

    stream = {
      deferLabel: label,
      initialCount: initialCountArg.value,
      "if": ifArg != null ? ifArg.value : null,
      streamLabel: label
    };
  }

  var _ConnectionInterface$ = ConnectionInterface.get(),
      EDGES = _ConnectionInterface$.EDGES,
      PAGE_INFO = _ConnectionInterface$.PAGE_INFO;

  var edgeField;
  var pageInfoField;
  var selections = [];
  transformed.selections.forEach(function (selection) {
    if (!(selection.kind === 'LinkedField' || selection.kind === 'ScalarField')) {
      throw createUserError('Invalid use of @connection_resolver, selections on the connection ' + 'must be linked or scalar fields.', [selection.loc]);
    }

    if (selection.kind === 'LinkedField') {
      if (selection.name === EDGES) {
        edgeField = selection;
      } else if (selection.name === PAGE_INFO) {
        pageInfoField = selection;
      } else {
        selections.push(selection);
      }
    } else {
      selections.push(selection);
    }
  });

  if (edgeField == null || pageInfoField == null) {
    throw createUserError("Invalid use of @connection_resolver, fields '".concat(EDGES, "' and ") + "'".concat(PAGE_INFO, "' must be  fetched."), [connectionDirective.loc]);
  }

  var connectionType = schema.getRawType(transformed.type);
  var edgesFieldDef = schema.isObject(connectionType) ? schema.getFieldByName(schema.assertObjectType(connectionType), 'edges') : null;
  var edgesType = edgesFieldDef != null ? schema.getRawType(schema.getFieldType(edgesFieldDef)) : null;
  var nodeFieldDef = edgesType != null && schema.isObject(edgesType) ? schema.getFieldByName(schema.assertObjectType(edgesType), 'node') : null;
  var nodeType = nodeFieldDef != null ? schema.getRawType(schema.getFieldType(nodeFieldDef)) : null;

  if (edgesType == null || nodeType == null || !(schema.isObject(nodeType) || schema.isInterface(nodeType) || schema.isUnion(nodeType))) {
    throw createUserError('Invalid usage of @connection_resolver, expected field to have shape ' + "'field { edges { node { ...} } }'.", [transformed.loc]);
  }

  edgeField = (0, _objectSpread2["default"])({}, edgeField, {
    selections: [].concat((0, _toConsumableArray2["default"])(edgeField.selections), [{
      alias: '__id',
      args: [],
      directives: [],
      handles: null,
      kind: 'ScalarField',
      loc: edgeField.loc,
      metadata: null,
      name: '__id',
      type: schema.assertScalarFieldType(schema.getNonNullType(schema.expectIdType()))
    }, {
      alias: 'node',
      args: [],
      connection: false,
      directives: [],
      handles: null,
      kind: 'LinkedField',
      loc: edgeField.loc,
      metadata: null,
      name: 'node',
      selections: [{
        alias: '__id',
        args: [],
        directives: [],
        handles: null,
        kind: 'ScalarField',
        loc: edgeField.loc,
        metadata: null,
        name: '__id',
        type: schema.assertScalarFieldType(schema.getNonNullType(schema.expectIdType()))
      }],
      type: schema.assertLinkedFieldType(nodeType)
    }])
  });
  selections.push({
    args: transformed.args,
    kind: 'Connection',
    label: label,
    loc: transformed.loc,
    name: transformed.name,
    selections: [edgeField, pageInfoField],
    stream: stream,
    type: transformed.type
  });
  var connectionMetadata = buildConnectionMetadata(transformed, path, stream != null);
  state.connectionMetadata.push(connectionMetadata);
  return {
    alias: transformed.alias,
    args: transformed.args,
    directives: transformed.directives.filter(function (directive) {
      return directive !== connectionDirective;
    }),
    kind: 'ConnectionField',
    loc: transformed.loc,
    metadata: null,
    name: transformed.name,
    selections: selections,
    type: transformed.type
  };
}

function visitScalarField(field) {
  var connectionDirective = field.directives.find(function (directive) {
    return directive.name === 'connection_resolver';
  });

  if (connectionDirective != null) {
    throw createUserError('The @connection_resolver direction is not supported on scalar fields, ' + 'only fields returning an object/interface/union', [connectionDirective.loc]);
  }

  return field;
}

function getLiteralStringArgument(directive, argName) {
  var arg = directive.args.find(function (_ref6) {
    var name = _ref6.name;
    return name === argName;
  });

  if (arg == null) {
    return null;
  }

  var value = arg.value.kind === 'Literal' ? arg.value.value : null;

  if (value == null || typeof value !== 'string') {
    throw createUserError("Expected the '".concat(argName, "' value to @").concat(directive.name, " to be a string literal if provided."), [arg.value.loc]);
  }

  return value;
}

module.exports = {
  SCHEMA_EXTENSION: SCHEMA_EXTENSION,
  transform: connectionFieldTransform
};