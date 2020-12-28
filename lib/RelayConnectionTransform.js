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

var IRTransformer = require("./GraphQLIRTransformer");

var RelayParser = require("./RelayParser");

var SchemaUtils = require("./GraphQLSchemaUtils");

var getLiteralArgumentValues = require("./getLiteralArgumentValues");

var _require = require("./RelayCompilerError"),
    createCompilerError = _require.createCompilerError,
    createUserError = _require.createUserError;

var _require2 = require("./RelayConnectionConstants"),
    AFTER = _require2.AFTER,
    BEFORE = _require2.BEFORE,
    FIRST = _require2.FIRST,
    KEY = _require2.KEY,
    LAST = _require2.LAST;

var _require3 = require("graphql"),
    GraphQLInterfaceType = _require3.GraphQLInterfaceType,
    GraphQLList = _require3.GraphQLList,
    GraphQLObjectType = _require3.GraphQLObjectType,
    GraphQLScalarType = _require3.GraphQLScalarType,
    GraphQLString = _require3.GraphQLString,
    GraphQLUnionType = _require3.GraphQLUnionType,
    parse = _require3.parse;

var _require4 = require("relay-runtime"),
    ConnectionInterface = _require4.ConnectionInterface,
    RelayFeatureFlags = _require4.RelayFeatureFlags;

var VARIABLE_NAME = RelayFeatureFlags.INCREMENTAL_DELIVERY_VARIABLE_NAME;
var CONNECTION = 'connection';
var STREAM_CONNECTION = 'stream_connection';
var HANDLER = 'handler';
/**
 * @public
 *
 * Transforms fields with the `@connection` directive:
 * - Verifies that the field type is connection-like.
 * - Adds a `handle` property to the field, either the user-provided `handle`
 *   argument or the default value "connection".
 * - Inserts a sub-fragment on the field to ensure that standard connection
 *   fields are fetched (e.g. cursors, node ids, page info).
 */

function relayConnectionTransform(context) {
  return IRTransformer.transform(context, {
    Fragment: visitFragmentOrRoot,
    LinkedField: visitLinkedField,
    Root: visitFragmentOrRoot
  }, function (node) {
    return {
      path: [],
      connectionMetadata: []
    };
  });
}

var SCHEMA_EXTENSION = "\n  directive @connection(\n    key: String!\n    filters: [String]\n    handler: String\n  ) on FIELD\n\n  directive @stream_connection(\n    key: String!\n    filters: [String]\n    handler: String\n    label: String!\n    initial_count: Int!\n    if: Boolean = true\n  ) on FIELD\n";
/**
 * @internal
 */

function visitFragmentOrRoot(node, options) {
  var transformedNode = this.traverse(node, options);
  var connectionMetadata = options.connectionMetadata;

  if (connectionMetadata.length) {
    return (0, _objectSpread2["default"])({}, transformedNode, {
      metadata: (0, _objectSpread2["default"])({}, transformedNode.metadata, {
        connection: connectionMetadata
      })
    });
  }

  return transformedNode;
}
/**
 * @internal
 */


function visitLinkedField(field, options) {
  var _connectionArguments$;

  var nullableType = SchemaUtils.getNullableType(field.type);
  var isPlural = nullableType instanceof GraphQLList;
  var path = options.path.concat(isPlural ? null : field.alias || field.name);
  var transformedField = this.traverse(field, (0, _objectSpread2["default"])({}, options, {
    path: path
  }));
  var connectionDirective = field.directives.find(function (directive) {
    return directive.name === CONNECTION || directive.name === STREAM_CONNECTION;
  });

  if (!connectionDirective) {
    return transformedField;
  }

  if (!(nullableType instanceof GraphQLObjectType) && !(nullableType instanceof GraphQLInterfaceType)) {
    throw new createUserError("@".concat(connectionDirective.name, " used on invalid field '").concat(field.name, "'. ") + 'Expected the return type to be a non-plural interface or object, ' + "got '".concat(String(field.type), "'."), [transformedField.loc]);
  }

  validateConnectionSelection(transformedField);
  validateConnectionType(transformedField, nullableType, connectionDirective);
  var connectionMetadata = buildConnectionMetadata(transformedField, path);
  options.connectionMetadata.push(connectionMetadata);
  var connectionArguments = buildConnectionArguments(transformedField, connectionDirective);
  var handle = {
    name: (_connectionArguments$ = connectionArguments.handler) !== null && _connectionArguments$ !== void 0 ? _connectionArguments$ : CONNECTION,
    key: connectionArguments.key,
    filters: connectionArguments.filters
  };
  var direction = connectionMetadata.direction;

  if (direction != null) {
    var selections = transformConnectionSelections(this.getContext(), transformedField, nullableType, direction, connectionArguments);
    transformedField = (0, _objectSpread2["default"])({}, transformedField, {
      selections: selections
    });
  }

  return (0, _objectSpread2["default"])({}, transformedField, {
    directives: transformedField.directives.filter(function (directive) {
      return directive !== connectionDirective;
    }),
    handles: transformedField.handles ? (0, _toConsumableArray2["default"])(transformedField.handles).concat([handle]) : [handle]
  });
}

function buildConnectionArguments(field, connectionDirective) {
  var _getLiteralArgumentVa = getLiteralArgumentValues(connectionDirective.args),
      handler = _getLiteralArgumentVa.handler,
      key = _getLiteralArgumentVa.key,
      label = _getLiteralArgumentVa.label,
      literalFilters = _getLiteralArgumentVa.filters;

  if (handler != null && typeof handler !== 'string') {
    var _ref, _handleArg$value;

    var handleArg = connectionDirective.args.find(function (arg) {
      return arg.name === 'key';
    });
    throw createUserError("Expected the ".concat(HANDLER, " argument to @").concat(connectionDirective.name, " to ") + "be a string literal for field ".concat(field.name, "."), [(_ref = handleArg === null || handleArg === void 0 ? void 0 : (_handleArg$value = handleArg.value) === null || _handleArg$value === void 0 ? void 0 : _handleArg$value.loc) !== null && _ref !== void 0 ? _ref : connectionDirective.loc]);
  }

  if (typeof key !== 'string') {
    var _ref2, _keyArg$value;

    var keyArg = connectionDirective.args.find(function (arg) {
      return arg.name === 'key';
    });
    throw createUserError("Expected the ".concat(KEY, " argument to @").concat(connectionDirective.name, " to be a ") + "string literal for field ".concat(field.name, "."), [(_ref2 = keyArg === null || keyArg === void 0 ? void 0 : (_keyArg$value = keyArg.value) === null || _keyArg$value === void 0 ? void 0 : _keyArg$value.loc) !== null && _ref2 !== void 0 ? _ref2 : connectionDirective.loc]);
  }

  var postfix = field.alias || field.name;

  if (!key.endsWith('_' + postfix)) {
    var _ref3, _keyArg$value2;

    var _keyArg = connectionDirective.args.find(function (arg) {
      return arg.name === 'key';
    });

    throw createUserError("Expected the ".concat(KEY, " argument to @").concat(connectionDirective.name, " to be of ") + "form <SomeName>_".concat(postfix, ", got '").concat(key, "'. ") + 'For a detailed explanation, check out ' + 'https://facebook.github.io/relay/docs/en/pagination-container.html#connection', [(_ref3 = _keyArg === null || _keyArg === void 0 ? void 0 : (_keyArg$value2 = _keyArg.value) === null || _keyArg$value2 === void 0 ? void 0 : _keyArg$value2.loc) !== null && _ref3 !== void 0 ? _ref3 : connectionDirective.loc]);
  }

  if (literalFilters != null && (!Array.isArray(literalFilters) || literalFilters.some(function (filter) {
    return typeof filter !== 'string';
  }))) {
    var _ref4, _filtersArg$value;

    var filtersArg = connectionDirective.args.find(function (arg) {
      return arg.name === 'filters';
    });
    throw createUserError("Expected the 'filters' argument to @".concat(connectionDirective.name, " to be ") + 'a string literal.', [(_ref4 = filtersArg === null || filtersArg === void 0 ? void 0 : (_filtersArg$value = filtersArg.value) === null || _filtersArg$value === void 0 ? void 0 : _filtersArg$value.loc) !== null && _ref4 !== void 0 ? _ref4 : connectionDirective.loc]);
  }

  var filters = literalFilters;

  if (filters == null) {
    var generatedFilters = field.args.filter(function (arg) {
      return !ConnectionInterface.isConnectionCall({
        name: arg.name,
        value: null
      });
    }).map(function (arg) {
      return arg.name;
    });
    filters = generatedFilters.length !== 0 ? generatedFilters : null;
  }

  var stream = null;

  if (connectionDirective.name === STREAM_CONNECTION) {
    var _label;

    var initialCountArg = connectionDirective.args.find(function (arg) {
      return arg.name === 'initial_count';
    });
    var ifArg = connectionDirective.args.find(function (arg) {
      return arg.name === 'if';
    });

    if (!RelayFeatureFlags.ENABLE_INCREMENTAL_DELIVERY) {
      if (ifArg == null || ifArg.value.kind !== 'Variable' || ifArg.value.variableName !== VARIABLE_NAME) {
        var _ref5;

        throw createUserError("The @stream_connection directive requires an 'if: $".concat(VARIABLE_NAME, "' ") + 'argument. This is a temporary restriction during rollout of ' + 'incremental data delivery.', [((_ref5 = ifArg === null || ifArg === void 0 ? void 0 : ifArg.value) !== null && _ref5 !== void 0 ? _ref5 : connectionDirective).loc]);
      }
    }

    if (label != null && typeof label !== 'string') {
      var _ref6, _labelArg$value;

      var labelArg = connectionDirective.args.find(function (arg) {
        return arg.name === 'label';
      });
      throw createUserError("Expected the 'label' argument to @".concat(connectionDirective.name, " to be a string literal for field ").concat(field.name, "."), [(_ref6 = labelArg === null || labelArg === void 0 ? void 0 : (_labelArg$value = labelArg.value) === null || _labelArg$value === void 0 ? void 0 : _labelArg$value.loc) !== null && _ref6 !== void 0 ? _ref6 : connectionDirective.loc]);
    }

    stream = {
      "if": ifArg,
      initialCount: initialCountArg,
      label: (_label = label) !== null && _label !== void 0 ? _label : key
    };
  }

  return {
    handler: handler,
    key: key,
    filters: filters,
    stream: stream
  };
}

function buildConnectionMetadata(field, path) {
  var pathHasPlural = path.includes(null);
  var firstArg = findArg(field, FIRST);
  var lastArg = findArg(field, LAST);
  var direction = null;
  var countArg = null;
  var cursorArg = null;

  if (firstArg && !lastArg) {
    direction = 'forward';
    countArg = firstArg;
    cursorArg = findArg(field, AFTER);
  } else if (lastArg && !firstArg) {
    direction = 'backward';
    countArg = lastArg;
    cursorArg = findArg(field, BEFORE);
  } else if (lastArg && firstArg) {
    direction = 'bidirectional'; // TODO(T26511885) Maybe add connection metadata to this case
  }

  var countVariable = countArg && countArg.value.kind === 'Variable' ? countArg.value.variableName : null;
  var cursorVariable = cursorArg && cursorArg.value.kind === 'Variable' ? cursorArg.value.variableName : null;
  return {
    count: countVariable,
    cursor: cursorVariable,
    direction: direction,
    path: pathHasPlural ? null : path
  };
}
/**
 * @internal
 *
 * Transforms the selections on a connection field, generating fields necessary
 * for pagination (edges.cursor, pageInfo, etc) and adding/merging them with
 * existing selections.
 */


function transformConnectionSelections(context, field, nullableType, direction, connectionArguments) {
  var derivedLocation = {
    kind: 'Derived',
    source: field.loc
  };

  var _ConnectionInterface$ = ConnectionInterface.get(),
      CURSOR = _ConnectionInterface$.CURSOR,
      EDGES = _ConnectionInterface$.EDGES,
      END_CURSOR = _ConnectionInterface$.END_CURSOR,
      HAS_NEXT_PAGE = _ConnectionInterface$.HAS_NEXT_PAGE,
      HAS_PREV_PAGE = _ConnectionInterface$.HAS_PREV_PAGE,
      NODE = _ConnectionInterface$.NODE,
      PAGE_INFO = _ConnectionInterface$.PAGE_INFO,
      START_CURSOR = _ConnectionInterface$.START_CURSOR; // Find existing edges/pageInfo selections


  var edgesSelection;
  var pageInfoSelection;
  field.selections.forEach(function (selection) {
    if (selection.kind === 'LinkedField') {
      if (selection.name === EDGES) {
        if (edgesSelection != null) {
          throw createCompilerError("RelayConnectionTransform: Unexpected duplicate field '".concat(EDGES, "'."), [edgesSelection.loc, selection.loc]);
        }

        edgesSelection = selection;
        return;
      } else if (selection.name === PAGE_INFO) {
        if (pageInfoSelection != null) {
          throw createCompilerError("RelayConnectionTransform: Unexpected duplicate field '".concat(PAGE_INFO, "'."), [pageInfoSelection.loc, selection.loc]);
        }

        pageInfoSelection = selection;
        return;
      }
    }
  }); // If streaming is enabled, construct directives to apply to the edges/
  // pageInfo fields

  var streamDirective;
  var deferDirective;
  var stream = connectionArguments.stream;

  if (stream != null) {
    streamDirective = {
      args: [stream["if"], stream.initialCount, {
        kind: 'Argument',
        loc: derivedLocation,
        metadata: null,
        name: 'label',
        type: GraphQLString,
        value: {
          kind: 'Literal',
          loc: derivedLocation,
          metadata: null,
          value: stream.label
        }
      }].filter(Boolean),
      kind: 'Directive',
      loc: derivedLocation,
      metadata: null,
      name: 'stream'
    };
    deferDirective = {
      args: [stream["if"], {
        kind: 'Argument',
        loc: derivedLocation,
        metadata: null,
        name: 'label',
        type: GraphQLString,
        value: {
          kind: 'Literal',
          loc: derivedLocation,
          metadata: null,
          value: stream.label + '$' + PAGE_INFO
        }
      }].filter(Boolean),
      kind: 'Directive',
      loc: derivedLocation,
      metadata: null,
      name: 'defer'
    };
  } // For backwards compatibility with earlier versions of this transform,
  // edges/pageInfo have to be generated as non-aliased fields (since product
  // code may be accessing the non-aliased response keys). But for streaming
  // mode we need to generate @stream/@defer directives on these fields *and*
  // we prefer to avoid generating extra selections (we want one payload per
  // item, not two as could happen with separate @stream directives on the
  // aliased and non-aliased edges fields). So we keep things simple by
  // disallowing aliases on edges/pageInfo in streaming mode.


  if (edgesSelection && edgesSelection.alias != null) {
    if (stream) {
      throw createUserError("@stream_connection does not support aliasing the '".concat(EDGES, "' field."), [edgesSelection.loc]);
    }

    edgesSelection = null;
  }

  if (pageInfoSelection && pageInfoSelection.alias != null) {
    if (stream) {
      throw createUserError("@stream_connection does not support aliasing the '".concat(PAGE_INFO, "' field."), [pageInfoSelection.loc]);
    }

    pageInfoSelection = null;
  } // Separately create transformed versions of edges/pageInfo so that we can
  // later replace the originals at the same point within the selection array


  var transformedEdgesSelection = edgesSelection;
  var transformedPageInfoSelection = pageInfoSelection;
  var edgesType = nullableType.getFields()[EDGES].type;
  var pageInfoType = nullableType.getFields()[PAGE_INFO].type;

  if (transformedEdgesSelection == null) {
    transformedEdgesSelection = {
      alias: null,
      args: [],
      directives: [],
      handles: null,
      kind: 'LinkedField',
      loc: derivedLocation,
      metadata: null,
      name: EDGES,
      selections: [],
      type: edgesType
    };
  }

  if (transformedPageInfoSelection == null) {
    transformedPageInfoSelection = {
      alias: null,
      args: [],
      directives: [],
      handles: null,
      kind: 'LinkedField',
      loc: derivedLocation,
      metadata: null,
      name: PAGE_INFO,
      selections: [],
      type: pageInfoType
    };
  } // Generate (additional) fields on pageInfo and add to the transformed
  // pageInfo field


  var pageInfoRawType = SchemaUtils.getRawType(pageInfoType);
  var pageInfoText;

  if (direction === 'forward') {
    pageInfoText = "fragment PageInfo on ".concat(String(pageInfoRawType), " {\n      ").concat(END_CURSOR, "\n      ").concat(HAS_NEXT_PAGE, "\n    }");
  } else if (direction === 'backward') {
    pageInfoText = "fragment PageInfo on ".concat(String(pageInfoRawType), "  {\n      ").concat(HAS_PREV_PAGE, "\n      ").concat(START_CURSOR, "\n    }");
  } else {
    pageInfoText = "fragment PageInfo on ".concat(String(pageInfoRawType), "  {\n      ").concat(END_CURSOR, "\n      ").concat(HAS_NEXT_PAGE, "\n      ").concat(HAS_PREV_PAGE, "\n      ").concat(START_CURSOR, "\n    }");
  }

  var pageInfoAst = parse(pageInfoText);
  var pageInfoFragment = RelayParser.transform(context.clientSchema, [pageInfoAst.definitions[0]])[0];

  if (transformedPageInfoSelection.kind !== 'LinkedField') {
    throw createCompilerError('RelayConnectionTransform: Expected generated pageInfo selection to be ' + 'a LinkedField', [field.loc]);
  }

  transformedPageInfoSelection = (0, _objectSpread2["default"])({}, transformedPageInfoSelection, {
    selections: (0, _toConsumableArray2["default"])(transformedPageInfoSelection.selections).concat([{
      directives: [],
      kind: 'InlineFragment',
      loc: derivedLocation,
      metadata: null,
      typeCondition: pageInfoFragment.type,
      selections: pageInfoFragment.selections
    }])
  }); // When streaming the pageInfo field has to be deferred

  if (deferDirective != null) {
    transformedPageInfoSelection = {
      directives: [deferDirective],
      kind: 'InlineFragment',
      loc: derivedLocation,
      metadata: null,
      typeCondition: nullableType,
      selections: [transformedPageInfoSelection]
    };
  } // Generate additional fields on edges and append to the transformed edges
  // selection


  var edgeText = "\n    fragment Edges on ".concat(String(SchemaUtils.getRawType(edgesType)), " {\n      ").concat(CURSOR, "\n      ").concat(NODE, " {\n        __typename # rely on GenerateRequisiteFieldTransform to add \"id\"\n      }\n    }\n  ");
  var edgeAst = parse(edgeText);
  var edgeFragment = RelayParser.transform(context.clientSchema, [edgeAst.definitions[0]])[0]; // When streaming the edges field needs @stream

  transformedEdgesSelection = (0, _objectSpread2["default"])({}, transformedEdgesSelection, {
    directives: streamDirective != null ? (0, _toConsumableArray2["default"])(transformedEdgesSelection.directives).concat([streamDirective]) : transformedEdgesSelection.directives,
    selections: (0, _toConsumableArray2["default"])(transformedEdgesSelection.selections).concat([{
      directives: [],
      kind: 'InlineFragment',
      loc: derivedLocation,
      metadata: null,
      typeCondition: edgeFragment.type,
      selections: edgeFragment.selections
    }])
  }); // Copy the original selections, replacing edges/pageInfo (if present)
  // with the generated locations. This is to maintain the original field
  // ordering.

  var selections = field.selections.map(function (selection) {
    if (transformedEdgesSelection != null && edgesSelection != null && selection === edgesSelection) {
      return transformedEdgesSelection;
    } else if (transformedPageInfoSelection != null && pageInfoSelection != null && selection === pageInfoSelection) {
      return transformedPageInfoSelection;
    } else {
      return selection;
    }
  }); // If edges/pageInfo were missing, append the generated versions instead.

  if (edgesSelection == null && transformedEdgesSelection != null) {
    selections.push(transformedEdgesSelection);
  }

  if (pageInfoSelection == null && transformedPageInfoSelection != null) {
    selections.push(transformedPageInfoSelection);
  }

  return selections;
}

function findArg(field, argName) {
  return field.args && field.args.find(function (arg) {
    return arg.name === argName;
  });
}
/**
 * @internal
 *
 * Validates that the selection is a valid connection:
 * - Specifies a first or last argument to prevent accidental, unconstrained
 *   data access.
 * - Has an `edges` selection, otherwise there is nothing to paginate.
 *
 * TODO: This implementation requires the edges field to be a direct selection
 * and not contained within an inline fragment or fragment spread. It's
 * technically possible to remove this restriction if this pattern becomes
 * common/necessary.
 */


function validateConnectionSelection(field) {
  var _ConnectionInterface$2 = ConnectionInterface.get(),
      EDGES = _ConnectionInterface$2.EDGES;

  if (!findArg(field, FIRST) && !findArg(field, LAST)) {
    throw createUserError("Expected field '".concat(field.name, "' to have a '").concat(FIRST, "' or '").concat(LAST, "' ") + 'argument.', [field.loc]);
  }

  if (!field.selections.some(function (selection) {
    return selection.kind === 'LinkedField' && selection.name === EDGES;
  })) {
    throw createUserError("Expected field '".concat(field.name, "' to have an '").concat(EDGES, "' selection."), [field.loc]);
  }
}
/**
 * @internal
 *
 * Validates that the type satisfies the Connection specification:
 * - The type has an edges field, and edges have scalar `cursor` and object
 *   `node` fields.
 * - The type has a page info field which is an object with the correct
 *   subfields.
 */


function validateConnectionType(field, nullableType, connectionDirective) {
  var directiveName = connectionDirective.name;

  var _ConnectionInterface$3 = ConnectionInterface.get(),
      CURSOR = _ConnectionInterface$3.CURSOR,
      EDGES = _ConnectionInterface$3.EDGES,
      END_CURSOR = _ConnectionInterface$3.END_CURSOR,
      HAS_NEXT_PAGE = _ConnectionInterface$3.HAS_NEXT_PAGE,
      HAS_PREV_PAGE = _ConnectionInterface$3.HAS_PREV_PAGE,
      NODE = _ConnectionInterface$3.NODE,
      PAGE_INFO = _ConnectionInterface$3.PAGE_INFO,
      START_CURSOR = _ConnectionInterface$3.START_CURSOR;

  var typeName = String(nullableType);
  var typeFields = nullableType.getFields();
  var edges = typeFields[EDGES];

  if (edges == null) {
    throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected the ") + "field type '".concat(typeName, "' to have an '").concat(EDGES, "' field"), [field.loc]);
  }

  var edgesType = SchemaUtils.getNullableType(edges.type);

  if (!(edgesType instanceof GraphQLList)) {
    throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected the ") + "field type '".concat(typeName, "' to have an '").concat(EDGES, "' field that returns ") + 'a list of objects.', [field.loc]);
  }

  var edgeType = SchemaUtils.getNullableType(edgesType.ofType);

  if (!(edgeType instanceof GraphQLObjectType) && !(edgeType instanceof GraphQLInterfaceType)) {
    throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected the ") + "field type '".concat(typeName, "' to have an '").concat(EDGES, "' field that returns ") + 'a list of objects.', [field.loc]);
  }

  var node = edgeType.getFields()[NODE];

  if (node == null) {
    throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected the ") + "field type '".concat(typeName, "' to have an '").concat(EDGES, " { ").concat(NODE, " }' field ") + 'that returns an object, interface, or union.', [field.loc]);
  }

  var nodeType = SchemaUtils.getNullableType(node.type);

  if (!(nodeType instanceof GraphQLInterfaceType || nodeType instanceof GraphQLUnionType || nodeType instanceof GraphQLObjectType)) {
    throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected the ") + "field type '".concat(typeName, "' to have an '").concat(EDGES, " { ").concat(NODE, " }' field ") + 'that returns an object, interface, or union.', [field.loc]);
  }

  var cursor = edgeType.getFields()[CURSOR];

  if (cursor == null || !(SchemaUtils.getNullableType(cursor.type) instanceof GraphQLScalarType)) {
    throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected the ") + "field type '".concat(typeName, "' to have an '").concat(EDGES, " { ").concat(CURSOR, " }' field ") + 'that returns a scalar value.', [field.loc]);
  }

  var pageInfo = typeFields[PAGE_INFO];

  if (pageInfo == null) {
    throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected the ") + "field type '".concat(typeName, "' to have a '").concat(PAGE_INFO, "' field that returns ") + 'an object.', [field.loc]);
  }

  var pageInfoType = SchemaUtils.getNullableType(pageInfo.type);

  if (!(pageInfoType instanceof GraphQLObjectType)) {
    throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected the ") + "field type '".concat(typeName, "' to have a '").concat(PAGE_INFO, "' field that ") + 'returns an object.', [field.loc]);
  }

  [END_CURSOR, HAS_NEXT_PAGE, HAS_PREV_PAGE, START_CURSOR].forEach(function (fieldName) {
    var pageInfoField = pageInfoType.getFields()[fieldName];

    if (pageInfoField == null || !(SchemaUtils.getNullableType(pageInfoField.type) instanceof GraphQLScalarType)) {
      throw createUserError("@".concat(directiveName, " used on invalid field '").concat(field.name, "'. Expected ") + "the field type '".concat(typeName, "' to have a '").concat(PAGE_INFO, " { ").concat(fieldName, " }' ") + 'field returns a scalar.', [field.loc]);
    }
  });
}

module.exports = {
  CONNECTION: CONNECTION,
  SCHEMA_EXTENSION: SCHEMA_EXTENSION,
  transform: relayConnectionTransform
};