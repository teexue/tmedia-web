// This file augments the built-in FileSystemFileHandle interface to include
// the permission-related methods, which are not yet part of the standard
// TypeScript DOM library typings.

interface FileSystemFileHandle {
  /**
   * Queries the current permission state of the file handle.
   * @param options - An object with a 'mode' property, either 'read' or 'readwrite'.
   * @returns A Promise that resolves to 'granted', 'denied', or 'prompt'.
   */
  queryPermission(options?: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;

  /**
   * Requests 'read' or 'readwrite' permission for the file handle.
   * @param options - An object with a 'mode' property, either 'read' or 'readwrite'.
   * @returns A Promise that resolves to 'granted' or 'denied'.
   */
  requestPermission(options?: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
}
