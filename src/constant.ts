export enum COMMANDS {
  VSCODE_OPEN = "vscode.open",
  SWAGGER_TO_TYPESCRIPT_CONVERT = "swagger.to.typescript.convert",
  SWAGGER_TO_TYPESCRIPT_OBJECT_CONVERT = "swagger.to.typescript.object.convert",
  SWAGGER_TO_TYPESCRIPT_ADD_COMMENTS = "swagger.to.typescript.add.comments",
}

export enum EXTRA {
  TEMPORARY_FILE_NAME = "js-to-ts.ts",
}

export enum CUSTOM_CONFIG {
  OPEN_TEMPORARY_FILE = 'openTemporaryFile',
  EXPORT_TYPE = 'exportType',
  OPTIONAL = 'optional',
  COMMENTS = 'comments',
  PREFIX = 'prefix',
  STRICT_MODE = 'strictMode',
  TIMEOUT = 'timeout'
}

export enum COMMENTS_TYPES {
  ALL = "all",
  NONE = "none",
  LEADING_COMMENTS = "leadingComments",
  INNER_COMMENTS = "innerComments",
  TRAILING_COMMENTS = "trailingComments"
}

export enum HTTP_STATUS {
  SUCCEED = 'succeed',
  FAILED = 'failed',
}

export enum HTTP_MODE {
  CURL = 'curl',
  NORMAL = 'normal'
}


