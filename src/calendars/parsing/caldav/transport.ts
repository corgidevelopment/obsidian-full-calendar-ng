/**
 * @file transport.ts
 * @brief Implements a custom transport layer for the `dav` library using Obsidian's `request` API.
 *
 * @description
 * This file bridges the gap between the `dav.js` library, which expects an
 * XMLHttpRequest-like interface, and Obsidian's `request` function. The
 * `RequestBridge` and `Basic` classes adapt the API calls, allowing the
 * CalDAV client to work within the Obsidian desktop and mobile environments
 * without relying on a browser's built-in XHR object.
 *
 * @license See LICENSE.md
 */

import { co } from 'co';
import { Credentials, Request, transport } from 'dav';
import { request as makeRequest } from 'obsidian';

export class RequestBridge {
  /**
   * Bridge between Obsidian request and XMLHttpRequest
   */

  contentType?: string;
  responseText?: string;
  headers: Record<string, string> = {};

  constructor(credentials?: Credentials) {
    if (credentials) {
      this.setRequestHeader('Authorization', 'Basic ' + this.encode(credentials));
    }
  }

  encode(credentials: Credentials) {
    return window.btoa(credentials.username + ':' + credentials.password);
  }

  setRequestHeader(header: string, value: any) {
    if (header.toLowerCase() == 'content-type') {
      this.contentType = value.toString();
    } else {
      this.headers[header] = value.toString();
    }
  }
}

export class Basic extends transport.Transport {
  /**
   * @param {dav.Credentials} credentials user authorization.
   */

  credentials?: Credentials;

  constructor(credentials: Credentials) {
    super(credentials);
  }

  send(request: Request, url: string, options?: transport.TransportOptions): Promise<any> {
    return co(
      function* (this: Basic) {
        let sandbox = options && options.sandbox;
        let transformRequest = request.transformRequest;
        let transformResponse = request.transformResponse;
        let onerror = request.onerror;

        let requestBridge = new RequestBridge(this.credentials);
        if (sandbox) sandbox.add(requestBridge);
        if (transformRequest) transformRequest(requestBridge);

        let result;
        try {
          let response = makeRequest({
            url: url,
            method: request.method,
            contentType: requestBridge.contentType,
            body: request.requestData,
            headers: requestBridge.headers
          });
          requestBridge.responseText = yield Promise.resolve(response);
          result = transformResponse
            ? transformResponse(requestBridge)
            : requestBridge.responseText;
        } catch (error) {
          if (onerror) onerror(error as Error);
          throw error;
        }

        return result;
      }.bind(this)
    );
  }
}
