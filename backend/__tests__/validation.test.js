describe('Validation Schemas', () => {
  const { LoginSchema, RegisterSchema, CreateTripSchema, CreateReactionSchema, CreateCommentSchema } = require('../src/lib/validation');

  describe('LoginSchema', () => {
    test('valid login data', () => {
      const data = { email: 'test@example.com', password: 'password123' };
      expect(() => LoginSchema.parse(data)).not.toThrow();
    });

    test('invalid email', () => {
      const data = { email: 'invalid-email', password: 'password123' };
      expect(() => LoginSchema.parse(data)).toThrow();
    });

    test('short password', () => {
      const data = { email: 'test@example.com', password: '123' };
      expect(() => LoginSchema.parse(data)).toThrow();
    });
  });

  describe('RegisterSchema', () => {
    test('valid registration data', () => {
      const data = { name: 'John', email: 'john@example.com', password: 'password123' };
      expect(() => RegisterSchema.parse(data)).not.toThrow();
    });

    test('missing name', () => {
      const data = { email: 'john@example.com', password: 'password123' };
      expect(() => RegisterSchema.parse(data)).toThrow();
    });
  });

  describe('CreateTripSchema', () => {
    test('valid trip data', () => {
      const data = { title: 'My Trip', destination: 'Tokyo' };
      expect(() => CreateTripSchema.parse(data)).not.toThrow();
    });

    test('missing title', () => {
      const data = { destination: 'Tokyo' };
      expect(() => CreateTripSchema.parse(data)).toThrow();
    });
  });

  describe('CreateReactionSchema', () => {
    test('valid reaction', () => {
      const data = { emoji: '👍' };
      expect(() => CreateReactionSchema.parse(data)).not.toThrow();
    });

    test('long emoji', () => {
      const data = { emoji: 'too-long-emoji' };
      expect(() => CreateReactionSchema.parse(data)).toThrow();
    });
  });

  describe('CreateCommentSchema', () => {
    test('valid comment', () => {
      const data = { text: 'Great photo!' };
      expect(() => CreateCommentSchema.parse(data)).not.toThrow();
    });

    test('empty comment', () => {
      const data = { text: '' };
      expect(() => CreateCommentSchema.parse(data)).toThrow();
    });
  });
});