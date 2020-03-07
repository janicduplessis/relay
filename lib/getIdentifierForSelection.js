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

var invariant = require("fbjs/lib/invariant");

var _require = require("./GraphQLIRPrinter"),
    printArguments = _require.printArguments,
    printDirectives = _require.printDirectives;

/**
 * Generates an identifier that is unique to a given selection: the alias for
 * fields, the type for inline fragments, and a summary of the condition
 * variable and passing value for conditions.
 */
function getIdentifierForSelection(node) {
  if (node.kind === 'LinkedField' || node.kind === 'ScalarField') {
    return 'Field: ' + node.directives.length === 0 ? node.alias || node.name : (node.alias || node.name) + printDirectives(node.directives);
  } else if (node.kind === 'FragmentSpread') {
    return 'FragmentSpread:' + node.args.length === 0 ? node.name : node.name + printArguments(node.args);
  } else if (node.kind === 'ModuleImport') {
    return 'ModuleImport:'; // sibling @module are disallowed
  } else if (node.kind === 'Defer') {
    return 'Defer:' + node.label;
  } else if (node.kind === 'Stream') {
    return 'Stream:' + node.label;
  } else if (node.kind === 'InlineFragment') {
    return 'InlineFragment:' + node.typeCondition.name;
  } else if (node.kind === 'Condition') {
    return 'Condition:' + (node.condition.kind === 'Variable' ? '$' + node.condition.variableName : String(node.condition.value)) + String(node.passingValue);
  } else {
    !false ? process.env.NODE_ENV !== "production" ? invariant(false, 'getIdentifierForSelection: Unexpected kind `%s`.', node.kind) : invariant(false) : void 0;
  }
}

module.exports = getIdentifierForSelection;