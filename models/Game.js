const { model, Schema } = require('mongoose');

const gameSchema = new Schema({
  gameId: {
    type: String,
    required: true
  },
  wordToGuess: {
    type: String,
    default: ''
  },
  firstPlayer: {
    type: Object,
    required: true
  },
  secondPlayer: {
    type: Object,
    required: false
  },
  attempts: {
    type: Number,
    default: 5
  },
  usedChars: {
    type: Array,
    default: []
  }
});

module.exports = model('Game', gameSchema);