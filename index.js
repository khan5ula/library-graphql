const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { GraphQLError } = require('graphql')
const jwt = require('jsonwebtoken')

const mongoose = require('mongoose')
mongoose.set('strictQuery', false)
const Book = require('./models/book')
const Author = require('./models/author')
require('dotenv').config()

const MONGODB_URI = process.env.MONGODB_URI

console.log('connecting to', MONGODB_URI)

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

const typeDefs = `
  type Book {
    title: String!
    published: Int!
    author: Author!
    genres: [String!]!
    id: ID!
  }

  type Author {
    name: String!
    id: ID!
    born: Int
    bookCount: Int
  }

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]
    allAuthors: [Author!]
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ): Book

    editAuthor(
      name: String!
      setBornTo: Int!
    ): Author
  }
`

const resolvers = {
  Query: {
    bookCount: async () => Book.collection.countDocuments(),

    authorCount: async () => Author.collection.countDocuments(),

    allBooks: async (root, args) => {
      let filteredBooks = Book.find({})

      if (args.author) {
        const author = await Author.findOne({ name: args.author })
        filteredBooks = filteredBooks.where('author').equals(author._id)
      }

      if (args.genre) {
        filteredBooks = filteredBooks.where('genres').in([args.genre])
      }

      const books = await filteredBooks.populate('author')
      return books
    },

    allAuthors: async () => {
      const authors = await Author.find({})

      const authorsWithBookCount = await Promise.all(
        authors.map(async (author) => {
          const bookCount = await Book.countDocuments({ author: author._id })
          return {
            ...author.toObject(),
            bookCount,
          }
        })
      )

      return authorsWithBookCount
    },
  },

  Mutation: {
    addBook: async (root, args) => {
      const existingBook = await Book.find({ title: args.title })

      if (existingBook.length > 0) {
        throw new GraphQLError('Book title must be unique', {
          extensions: { code: 'BAD_USER_INPUT', invalidArgs: args.title },
        })
      }

      let author = await Author.findOne({ name: args.author })

      if (!author) {
        author = new Author({ name: args.author })

        try {
          await author.save()
        } catch (error) {
          throw new GraphQLError('Saving author failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.name,
              error,
            },
          })
        }
      }

      const book = new Book({ ...args, author: author.id })

      try {
        await book.save()
      } catch (error) {
        throw new GraphQLError('Saving book failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.name,
            error,
          },
        })
      }

      return book
    },

    editAuthor: async (root, args) => {
      const updatedAuthor = await Author.findOneAndUpdate(
        { name: args.name },
        { name: args.name, born: args.setBornTo },
        { new: true }
      )
      return updatedAuthor
    },
  },
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },

  // uncomment the context below for user authentication

  /*context: async ({ req, res }) => {
    const auth = req ? req.headers.authorization : null
    if (auth && auth.startsWith('Bearer ')) {
      const decodedToken = jwt.verify(auth.substring(7), process.env.JWT_SECRET)
      const currentUser = await User.findById(decodedToken.id).populate(
        'friends'
      )
      return { currentUser }
    }
  },*/
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
