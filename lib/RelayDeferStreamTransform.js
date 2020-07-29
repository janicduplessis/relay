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

var _require = require("./GraphQLSchemaUtils"),
    getNullableType = _require.getNullableType;

var _require2 = require("./RelayCompilerError"),
    createUserError = _require2.createUserError;

var _require3 = require("graphql"),
    GraphQLList = _require3.GraphQLList;

var _require4 = require("relay-runtime"),
    RelayFeatureFlags = _require4.RelayFeatureFlags;

var VARIABLE_NAME = RelayFeatureFlags.INCREMENTAL_DELIVERY_VARIABLE_NAME;

/**
 * This transform finds usages of @defer and @stream, validates them, and
 * converts the using node to specialized IR nodes (Defer/Stream).
 */
function relayDeferStreamTransform(context) {
  return IRTransformer.transform(context, {
    // TODO: type IRTransformer to allow changing result type
    FragmentSpread: visitFragmentSpread,
    // TODO: type IRTransformer to allow changing result type
    InlineFragment: visitInlineFragment,
    // TODO: type IRTransformer to allow changing result type
    LinkedField: visitLinkedField,
    ScalarField: visitScalarField
  }, function (sourceNode) {
    return {
      documentName: sourceNode.name
    };
  });
}

function visitLinkedField(field, state) {
  var _ref2;

  var transformedField = this.traverse(field, state);
  var streamDirective = transformedField.directives.find(function (directive) {
    return directive.name === 'stream';
  });

  if (streamDirective == null) {
    return transformedField;
  }

  var type = getNullableType(field.type);

  if (!(type instanceof GraphQLList)) {
    throw createUserError("Invalid use of @stream on non-plural field '".concat(field.name, "'"), [streamDirective.loc]);
  }

  transformedField = (0, _objectSpread2["default"])({}, transformedField, {
    directives: transformedField.directives.filter(function (directive) {
      return directive.name !== 'stream';
    })
  });
  var ifArg = streamDirective.args.find(function (arg) {
    return arg.name === 'if';
  });

  if (RelayFeatureFlags.ENABLE_INCREMENTAL_DELIVERY) {
    if (isLiteralFalse(ifArg)) {
      return transformedField;
    }
  } else {
    if (ifArg == null || ifArg.value.kind !== 'Variable' || ifArg.value.variableName !== VARIABLE_NAME) {
      var _ref;

      throw createUserError("The @stream directive requires an 'if: $".concat(VARIABLE_NAME, "' argument. ") + 'This is a temporary restriction during rollout of incremental data ' + 'delivery.', [((_ref = ifArg === null || ifArg === void 0 ? void 0 : ifArg.value) !== null && _ref !== void 0 ? _ref : streamDirective).loc]);
    }
  }

  var initialCount = streamDirective.args.find(function (arg) {
    return arg.name === 'initial_count';
  });

  if (initialCount == null) {
    throw createUserError("Invalid use of @stream, the 'initial_count' argument is required.", [streamDirective.loc]);
  }

  var label = getLiteralStringArgument(streamDirective, 'label');
  var transformedLabel = transformLabel(state.documentName, 'stream', label);
  return {
    "if": (_ref2 = ifArg === null || ifArg === void 0 ? void 0 : ifArg.value) !== null && _ref2 !== void 0 ? _ref2 : null,
    initialCount: initialCount.value,
    kind: 'Stream',
    label: transformedLabel,
    loc: {
      kind: 'Derived',
      source: streamDirective.loc
    },
    metadata: null,
    selections: [transformedField]
  };
}

function visitScalarField(field, state) {
  var streamDirective = field.directives.find(function (directive) {
    return directive.name === 'stream';
  });

  if (streamDirective != null) {
    throw createUserError("Invalid use of @stream on scalar field '".concat(field.name, "'"), [streamDirective.loc]);
  }

  return this.traverse(field, state);
}

function visitInlineFragment(fragment, state) {
  var _ref4;

  var transformedFragment = this.traverse(fragment, state);
  var deferDirective = transformedFragment.directives.find(function (directive) {
    return directive.name === 'defer';
  });

  if (deferDirective == null) {
    return transformedFragment;
  }

  transformedFragment = (0, _objectSpread2["default"])({}, transformedFragment, {
    directives: transformedFragment.directives.filter(function (directive) {
      return directive.name !== 'defer';
    })
  });
  var ifArg = deferDirective.args.find(function (arg) {
    return arg.name === 'if';
  });

  if (RelayFeatureFlags.ENABLE_INCREMENTAL_DELIVERY) {
    if (isLiteralFalse(ifArg)) {
      return transformedFragment;
    }
  } else {
    if (ifArg == null || ifArg.value.kind !== 'Variable' || ifArg.value.variableName !== VARIABLE_NAME) {
      var _ref3;

      throw createUserError("The @defer directive requires an 'if: $".concat(VARIABLE_NAME, "' argument. ") + 'This is a temporary restriction during rollout of incremental data ' + 'delivery.', [((_ref3 = ifArg === null || ifArg === void 0 ? void 0 : ifArg.value) !== null && _ref3 !== void 0 ? _ref3 : deferDirective).loc]);
    }
  }

  var label = getLiteralStringArgument(deferDirective, 'label');
  var transformedLabel = transformLabel(state.documentName, 'defer', label);
  return {
    "if": (_ref4 = ifArg === null || ifArg === void 0 ? void 0 : ifArg.value) !== null && _ref4 !== void 0 ? _ref4 : null,
    kind: 'Defer',
    label: transformedLabel,
    loc: {
      kind: 'Derived',
      source: deferDirective.loc
    },
    metadata: null,
    selections: [transformedFragment]
  };
}

function visitFragmentSpread(spread, state) {
  var _ref6;

  var transformedSpread = this.traverse(spread, state);
  var deferDirective = transformedSpread.directives.find(function (directive) {
    return directive.name === 'defer';
  });

  if (deferDirective == null) {
    return transformedSpread;
  }

  transformedSpread = (0, _objectSpread2["default"])({}, transformedSpread, {
    directives: transformedSpread.directives.filter(function (directive) {
      return directive.name !== 'defer';
    })
  });
  var ifArg = deferDirective.args.find(function (arg) {
    return arg.name === 'if';
  });

  if (RelayFeatureFlags.ENABLE_INCREMENTAL_DELIVERY) {
    if (isLiteralFalse(ifArg)) {
      return transformedSpread;
    }
  } else {
    if (ifArg == null || ifArg.value.kind !== 'Variable' || ifArg.value.variableName !== VARIABLE_NAME) {
      var _ref5;

      throw createUserError("The @defer directive requires an 'if: $".concat(VARIABLE_NAME, "' argument. ") + 'This is a temporary restriction during rollout of incremental data ' + 'delivery.', [((_ref5 = ifArg === null || ifArg === void 0 ? void 0 : ifArg.value) !== null && _ref5 !== void 0 ? _ref5 : deferDirective).loc]);
    }
  }

  var label = getLiteralStringArgument(deferDirective, 'label');
  var transformedLabel = transformLabel(state.documentName, 'defer', label);
  return {
    "if": (_ref6 = ifArg === null || ifArg === void 0 ? void 0 : ifArg.value) !== null && _ref6 !== void 0 ? _ref6 : null,
    kind: 'Defer',
    label: transformedLabel,
    loc: {
      kind: 'Derived',
      source: deferDirective.loc
    },
    metadata: null,
    selections: [transformedSpread]
  };
}

function getLiteralStringArgument(directive, argName) {
  var args = getLiteralArgumentValues(directive.args);
  var value = args[argName];

  if (typeof value !== 'string') {
    var _ref7, _arg$value;

    var arg = directive.args.find(function (arg) {
      return arg.name === argName;
    });
    throw createUserError("Expected the '".concat(argName, "' value to @").concat(directive.name, " to be a string literal."), [(_ref7 = arg === null || arg === void 0 ? void 0 : (_arg$value = arg.value) === null || _arg$value === void 0 ? void 0 : _arg$value.loc) !== null && _ref7 !== void 0 ? _ref7 : directive.loc]);
  }

  return value;
}

function transformLabel(parentName, directive, label) {
  return "".concat(parentName, "$").concat(directive, "$").concat(label);
}

function isLiteralFalse(arg) {
  return arg != null && arg.value.kind === 'Literal' && arg.value.value === false;
}

module.exports = {
  transform: relayDeferStreamTransform
};