import '@testing-library/jest-dom/vitest'

// Provide a real (in-memory) IndexedDB implementation for jsdom, since jsdom
// does not implement IndexedDB itself. This lets storage-layer unit tests
// exercise the actual `idb`-based repositories without mocking the browser
// API surface.
import 'fake-indexeddb/auto'
