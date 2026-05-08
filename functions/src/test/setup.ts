import functionsTest from 'firebase-functions-test'

export const test = functionsTest()

afterAll(() => test.cleanup())
