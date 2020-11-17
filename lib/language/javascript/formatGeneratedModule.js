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

var deepMergeAssignments = require('./deepMergeAssignments');

var formatGeneratedModule = function formatGeneratedModule(_ref) {
  var moduleName = _ref.moduleName,
      documentType = _ref.documentType,
      docText = _ref.docText,
      concreteText = _ref.concreteText,
      typeText = _ref.typeText,
      hash = _ref.hash,
      sourceHash = _ref.sourceHash,
      nodeDevOnlyProperties = _ref.nodeDevOnlyProperties;
  var documentTypeImport = documentType ? "import type { ".concat(documentType, " } from 'relay-runtime';") : '';
  var docTextComment = docText != null ? '\n/*\n' + docText.trim() + '\n*/\n' : '';
  var hashText = hash != null ? "\n * ".concat(hash) : '';
  var devOnlyAssignments = deepMergeAssignments('(node/*: any*/)', nodeDevOnlyProperties);
  var devOnlyAssignmentsText = devOnlyAssignments.length > 0 ? "\nif (__DEV__) {\n  ".concat(devOnlyAssignments, "\n}") : '';
  return "/**\n * ".concat('@', "flow", hashText, "\n */\n\n/* eslint-disable */\n\n'use strict';\n\n/*::\n").concat(documentTypeImport, "\n").concat(typeText || '', "\n*/\n\n").concat(docTextComment, "\nconst node/*: ").concat(documentType || 'empty', "*/ = ").concat(concreteText, ";").concat(devOnlyAssignmentsText, "\n// prettier-ignore\n(node/*: any*/).hash = '").concat(sourceHash, "';\n");
};

var formatGeneratedCommonjsModule = function formatGeneratedCommonjsModule(options) {
  return "".concat(formatGeneratedModule(options), "\nmodule.exports = node;\n");
};

var formatGeneratedESModule = function formatGeneratedESModule(options) {
  return "".concat(formatGeneratedModule(options), "\nexport default node;\n");
};

exports.formatGeneratedCommonjsModule = formatGeneratedCommonjsModule;
exports.formatGeneratedESModule = formatGeneratedESModule;