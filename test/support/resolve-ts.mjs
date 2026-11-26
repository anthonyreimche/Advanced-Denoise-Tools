// Resolves the sources' extensionless relative imports to their .ts files, so
// node's type stripping can run them as they are bundled.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) return next(`${specifier}.ts`, context);
    throw error;
  }
}
