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

var Profiler = require("./GraphQLCompilerProfiler");

var util = require("util");

var _require = require("graphql"),
    formatError = _require.formatError,
    FragmentsOnCompositeTypesRule = _require.FragmentsOnCompositeTypesRule,
    KnownArgumentNamesRule = _require.KnownArgumentNamesRule,
    KnownTypeNamesRule = _require.KnownTypeNamesRule,
    LoneAnonymousOperationRule = _require.LoneAnonymousOperationRule,
    NoUnusedVariablesRule = _require.NoUnusedVariablesRule,
    PossibleFragmentSpreadsRule = _require.PossibleFragmentSpreadsRule,
    UniqueArgumentNamesRule = _require.UniqueArgumentNamesRule,
    UniqueFragmentNamesRule = _require.UniqueFragmentNamesRule,
    UniqueInputFieldNamesRule = _require.UniqueInputFieldNamesRule,
    UniqueOperationNamesRule = _require.UniqueOperationNamesRule,
    UniqueVariableNamesRule = _require.UniqueVariableNamesRule,
    validate = _require.validate,
    ValuesOfCorrectTypeRule = _require.ValuesOfCorrectTypeRule,
    VariablesAreInputTypesRule = _require.VariablesAreInputTypesRule;

function validateOrThrow(document, schema, rules) {
  var validationErrors = validate(schema, document, rules);

  if (validationErrors && validationErrors.length > 0) {
    var formattedErrors = validationErrors.map(formatError);
    var errorMessages = validationErrors.map(function (e) {
      return e.toString();
    });
    var error = new Error(util.format('You supplied a GraphQL document with validation errors:\n%s', errorMessages.join('\n')));
    error.validationErrors = formattedErrors;
    throw error;
  }
}

function DisallowIdAsAliasValidationRule(context) {
  return {
    Field: function Field(field) {
      if (field.alias && field.alias.value === 'id' && field.name.value !== 'id') {
        throw new Error('RelayValidator: Relay does not allow aliasing fields to `id`. ' + 'This name is reserved for the globally unique `id` field on ' + '`Node`.');
      }
    }
  };
}

module.exports = {
  GLOBAL_RULES: [KnownArgumentNamesRule,
  /* Some rules are not enabled (potentially non-exhaustive)
   *
   * - KnownFragmentNamesRule: RelayClassic generates fragments at runtime,
   *   so RelayCompat queries might reference fragments unknown in build time.
   * - NoFragmentCyclesRule: Because of @argumentDefinitions, this validation
   *   incorrectly flags a subset of fragments using @include/@skip as
   *   recursive.
   * - NoUndefinedVariablesRule: Because of @argumentDefinitions, this
   *   validation incorrectly marks some fragment variables as undefined.
   * - NoUnusedFragmentsRule: Queries generated dynamically with RelayCompat
   *   might use unused fragments.
   * - OverlappingFieldsCanBeMergedRule: RelayClassic auto-resolves
   *   overlapping fields by generating aliases.
   */
  NoUnusedVariablesRule, UniqueArgumentNamesRule, UniqueFragmentNamesRule, UniqueInputFieldNamesRule, UniqueOperationNamesRule, UniqueVariableNamesRule],
  LOCAL_RULES: [
  /*
   * GraphQL built-in rules: a subset of these rules are enabled, some of the
   * default rules conflict with Relays-specific features:
   * - FieldsOnCorrectTypeRule: is not aware of @fixme_fat_interface.
   * - KnownDirectivesRule: doesn't pass with @arguments and other Relay
   *   directives.
   * - ScalarLeafsRule: is violated by the @match directive since these rules
   *   run before any transform steps.
   * - VariablesInAllowedPositionRule: violated by the @arguments directive,
   *   since @arguments is not defined in the schema. relay-compiler does its
   *   own type-checking for variable/argument usage that is aware of fragment
   *   variables.
   */
  FragmentsOnCompositeTypesRule, KnownTypeNamesRule, LoneAnonymousOperationRule, PossibleFragmentSpreadsRule, ValuesOfCorrectTypeRule, VariablesAreInputTypesRule, // Relay-specific validation
  DisallowIdAsAliasValidationRule],
  validate: Profiler.instrument(validateOrThrow, 'GraphQLValidator.validate')
};