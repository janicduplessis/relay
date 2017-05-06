/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+relay
 * @format
 */

'use strict';

const Relay = require('Relay');
const RelayNodeInterface = require('RelayNodeInterface');
const RelayTestUtils = require('RelayTestUtils');

describe('RelayNodeInterface', () => {
  const {getNode, getVerbatimNode} = RelayTestUtils;

  beforeEach(() => {
    jest.resetModules();
  });

  it('creates results for argument-less custom root calls with an id', () => {
    const query = getNode(
      Relay.QL`
      query {
        me {
          id
        }
      }`,
    );
    const payload = {
      me: {
        id: '1055790163',
      },
    };
    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: payload.me,
        rootCallInfo: {
          storageKey: 'me',
          identifyingArgKey: null,
          identifyingArgValue: null,
        },
      },
    ]);
  });

  it('creates results for argument-less custom root calls without an id', () => {
    const query = getNode(
      Relay.QL`
      query {
        viewer {
          actor {
            id
          }
        }
      }
    `,
    );
    const payload = {
      viewer: {
        actor: {
          id: '123',
        },
      },
    };
    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: payload.viewer,
        rootCallInfo: {
          storageKey: 'viewer',
          identifyingArgKey: null,
          identifyingArgValue: null,
        },
      },
    ]);
  });

  it('creates results for custom root calls with an id', () => {
    const query = getNode(
      Relay.QL`
      query {
        username(name:"yuzhi") {
          id
        }
      }
    `,
    );
    const payload = {
      username: {
        id: '1055790163',
      },
    };

    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: payload.username,
        rootCallInfo: {
          storageKey: 'username',
          identifyingArgKey: 'yuzhi',
          identifyingArgValue: 'yuzhi',
        },
      },
    ]);
  });

  it('creates results for custom root calls without an id', () => {
    const query = getVerbatimNode(
      Relay.QL`
      query {
        username(name:"yuzhi") {
          name
        }
      }
    `,
    );
    // no `id` value is present, so the root ID is autogenerated
    const payload = {
      username: {
        name: 'Yuzhi Zheng',
      },
    };
    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: payload.username,
        rootCallInfo: {
          storageKey: 'username',
          identifyingArgKey: 'yuzhi',
          identifyingArgValue: 'yuzhi',
        },
      },
    ]);
  });

  it('creates results for single identifying argument', () => {
    const query = getNode(
      Relay.QL`
      query {
        node(id:"123") {
          id
        }
      }
    `,
    );
    const payload = {
      node: {
        id: '123',
      },
    };
    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: payload.node,
        rootCallInfo: {
          storageKey: 'node',
          identifyingArgKey: '123',
          identifyingArgValue: '123',
        },
      },
    ]);
  });

  it('creates results for plural identifying arguments', () => {
    const query = getNode(
      Relay.QL`
      query {
        nodes(ids: ["123","456"]) {
          id
        }
      }
    `,
    );
    const payload = {
      nodes: [
        {
          id: '123',
        },
        {
          id: '456',
        },
      ],
    };
    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: payload.nodes[0],
        rootCallInfo: {
          storageKey: 'nodes',
          identifyingArgKey: '123',
          identifyingArgValue: '123',
        },
      },
      {
        result: payload.nodes[1],
        rootCallInfo: {
          storageKey: 'nodes',
          identifyingArgKey: '456',
          identifyingArgValue: '456',
        },
      },
    ]);
  });

  it('creates results for id-less identifying arguments', () => {
    const query = getNode(
      Relay.QL`
      query {
        task(number: 123) {
          title
        }
      }
    `,
    );
    const payload = {
      task: {
        title: 'Give Relay',
      },
    };
    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: payload.task,
        rootCallInfo: {
          storageKey: 'task',
          identifyingArgKey: '123',
          identifyingArgValue: 123,
        },
      },
    ]);
  });

  it('creates results for null response', () => {
    const query = getNode(
      Relay.QL`
      query {
        me {
          id
        }
      }`,
    );
    const payload = {
      me: null,
    };
    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: null,
        rootCallInfo: {
          storageKey: 'me',
          identifyingArgKey: null,
          identifyingArgValue: null,
        },
      },
    ]);
  });

  it('creates results for undefined response', () => {
    const query = getNode(
      Relay.QL`
      query {
        me {
          id
        }
      }`,
    );
    const payload = {};
    const result = RelayNodeInterface.getResultsFromPayload(query, payload);

    expect(result).toEqual([
      {
        result: null,
        rootCallInfo: {
          storageKey: 'me',
          identifyingArgKey: null,
          identifyingArgValue: null,
        },
      },
    ]);
  });
});
