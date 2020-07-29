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

var _toConsumableArray2 = _interopRequireDefault(require("@babel/runtime/helpers/toConsumableArray"));

var CompilerContext = require("./GraphQLCompilerContext");

var IRTransformer = require("./GraphQLIRTransformer");

var _require = require("./GraphQLSchemaUtils"),
    getRawType = _require.getRawType;

var _require2 = require("graphql"),
    GraphQLObjectType = _require2.GraphQLObjectType;

var _require3 = require("relay-runtime"),
    DEFAULT_HANDLE_KEY = _require3.DEFAULT_HANDLE_KEY;

var ID = 'id';
var VIEWER_HANDLE = 'viewer';
var VIEWER_TYPE = 'Viewer';
/**
 * A transform that adds a "viewer" handle to all fields whose type is `Viewer`.
 */

function relayViewerHandleTransform(context) {
  var viewerType = context.serverSchema.getType(VIEWER_TYPE);

  if (viewerType == null || !(viewerType instanceof GraphQLObjectType) || viewerType.getFields()[ID] != null) {
    return context;
  }

  return IRTransformer.transform(context, {
    LinkedField: visitLinkedField
  });
}

function visitLinkedField(field) {
  var transformedNode = this.traverse(field);

  if (getRawType(field.type).name !== VIEWER_TYPE) {
    return transformedNode;
  } // In case a viewer field has arguments, we shouldn't give it a global
  // identity. This only applies if the name is 'viewer' because a mutation
  // field might also be the Viewer type.


  if (field.args.length > 0 && field.name === 'viewer') {
    return transformedNode;
  }

  var handles = transformedNode.handles;
  var viewerHandle = {
    name: VIEWER_HANDLE,
    key: DEFAULT_HANDLE_KEY,
    filters: null
  };

  if (handles && !handles.find(function (handle) {
    return handle.name === VIEWER_HANDLE;
  })) {
    handles = (0, _toConsumableArray2["default"])(handles).concat([viewerHandle]);
  } else if (!handles) {
    handles = [viewerHandle];
  }

  return handles !== transformedNode.handles ? (0, _objectSpread2["default"])({}, transformedNode, {
    handles: handles
  }) : transformedNode;
}

module.exports = {
  transform: relayViewerHandleTransform
};