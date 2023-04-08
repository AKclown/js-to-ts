### 数据模拟

[easyMock](https://mock.presstime.cn/project/64315e0835bc4b91ac0173a6)
账号: AKclown

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
  isError: new Error(),
  isPromise: new Promise(() => {}),
};
```
