/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *  strict
 * @format
 */
'use strict';

var _require = require("crypto"),
    createHash = _require.createHash;

var projectToBuckets = null;
/**
 * This module helps gradually rolling out changes to the code generation by
 * gradually enabling more buckets representing randomly distributed artifacts.
 */

function set(newProjectToBuckets) {
  projectToBuckets = newProjectToBuckets;
}

function check(project, key) {
  if (projectToBuckets == null) {
    return true;
  }

  var buckets = projectToBuckets.get(project);

  if (buckets == null || buckets.length === 0) {
    return true;
  }

  var hash = createHash('md5').update(key).digest().readUInt16BE(0);
  return buckets[hash % buckets.length];
}

module.exports = {
  set: set,
  check: check
};