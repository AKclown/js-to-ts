import got = require("got");
import { HTTP_STATUS } from "../constant";

// *********************
// class interface
// *********************

export interface IMain {
  // *********************
  // Swagger To TS
  // *********************

  // *********************
  // API TO TS
  // *********************

  apiToTs(code: string): { value: string, status: HTTP_STATUS };

  // *********************
  // JS To TS
  // *********************

  jsToTs(): void;
}


// *********************
// interface
// *********************

export enum AST_TYPES {
  IDENTIFIER = "Identifier",
  STRING_LITERAL = "StringLiteral",
  NUMERIC_LITERAL = "NumericLiteral",
  BOOLEAN_LITERAL = "BooleanLiteral",
  NULL_LITERAL = "NullLiteral",
  TEMPLATE_LITERAL = "TemplateLiteral",
  BIGINT_LITERAL = "BigintLiteral",
  NEW_EXPRESSION = "NewExpression",
  CALL_EXPRESSION = "CallExpression",
  OBJECT_EXPRESSION = "ObjectExpression",
  ARRAY_EXPRESSION = "ArrayExpression",
}

export interface IGotOptions {
  url: string,
  options?: got.GotBodyOptions<string>
}