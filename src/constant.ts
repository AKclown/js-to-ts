// *********************
// commands
// *********************

export enum COMMANDS {
  VSCODE_OPEN = "vscode.open",
  SWAGGER_TO_TYPESCRIPT_CONVERT = "swagger.to.typescript.convert",
  SWAGGER_TO_TYPESCRIPT_OBJECT_CONVERT = "swagger.to.typescript.object.convert",
  SWAGGER_TO_TYPESCRIPT_ADD_COMMENTS = "swagger.to.typescript.add.comments",
}

export enum Extra {
  TEMPORARY_FILE_NAME = "js-to-ts.ts",
}

export enum CustomConfig {
  OPEN_TEMPORARY_FILE = 'openTemporaryFile',
  EXPORT_TYPE = 'exportType'
}
