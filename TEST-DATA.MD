### 数据模拟

[easyMock](https://mock.presstime.cn/project/64324d7248037aa2a4ae6397)
账号: AKclown123

### 测试代码

```ts
const AKclown = {
  isString: "AKclown",
  isNumber: 20,
  isBoolean: true,
  isUndefined: undefined,
  isNull: null,
  isArray: [
    { isString: "JS Object To Typescript" },
    "AKclown",
    1,
    1,
    [1, 3, "string"],
    true,
    undefined,
    null,
  ],
  isObject: {
    isString: "AKclown",
    isNumber: 20,
    isBoolean: true,
    isUndefined: undefined,
    isNull: null,
    isArray: [
      { title: "JS Object To Typescript" },
      "AKclown",
      1,
      [1, 3, "string"],
      true,
      undefined,
      null,
    ],
  },
  isSymbol: Symbol(),
  isDate: new Date(),
  isRegExp: new RegExp("ab+c"),
  isLiteralRegExp: /asdas/,
  isError: new Error(),
  isPromise: new Promise(() => {}),
  isCallback: (a: number, b: unknown, c = 1, ...rest) => {
    console.log(a, b, rest);
  },
};

```

```ts
ApiResponse«List«AKclownx»»{
    code (string, optional): 响应code,
    data (Array[AKclown], optional): 第三方返回相关数据,
    msg (string,optional): 错误信息
}
```
