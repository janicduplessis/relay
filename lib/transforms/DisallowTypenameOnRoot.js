/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 * @format
 */
// flowlint ambiguous-object-type:error
'use strict';

var IRValidator = require('../core/IRValidator');

var _require = require('../core/CompilerError'),
    createUserError = _require.createUserError;

function visitRoot(node) {
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = node.selections[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var selection = _step.value;

      if (selection.kind === 'ScalarField' && selection.name === '__typename') {
        throw createUserError('Relay does not allow `__typename` field on Query, Mutation or Subscription', [selection.loc]);
      }
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
}

function stopVisit() {}

function disallowTypenameOnRoot(context) {
  IRValidator.validate(context, {
    Root: visitRoot,
    Fragment: stopVisit
  });
  return context;
}

module.exports = {
  transform: disallowTypenameOnRoot
};