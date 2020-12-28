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

function createPrintRequireModuleDependency(extension) {
  return function (moduleName) {
    return "require('./".concat(moduleName, ".").concat(extension, "')");
  };
}

module.exports = createPrintRequireModuleDependency;