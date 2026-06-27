/// <reference types="node" />
/// <reference types="electron" />

// Make fetch available in Electron main process (Node 18+)
declare function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
