// DOM element references
const wordEl = document.getElementById("word");
const inputEl = document.getElementById("guessInput");
const boardEl = document.getElementById("board");
const infoStatsEl = document.getElementById("info_stats");
const openInstructionsEl = document.getElementById("openInstructions");
const modal = document.getElementById("instructionsModal");

const friendScoreEl = document.getElementById("friendScore");
const scoreEl = document.getElementById("score");

const tryAgainBtn = document.getElementById("tryAgain");
const shareBtn = document.getElementById("share");
const newWordBtn = document.getElementById("newWord");

const guessBoardCells = [...board.querySelectorAll("td")];
let currentCellIndex = 0;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

// the shift amount that is used for the Ceaeser Cipher to encode user guesses
const SHIFT = 5;

// keep track of user score and friend score
let currentWord;
let userScore = 0;
let friendScore;
let userGuesses = [];
let friendGuesses;

// this variable is populated by the parseData() function
const data = {};

/**
 * Initalize the UI components of the game.
 */
(async function initUI() {
    // show instructions modal on first site open
    if (!localStorage.getItem("visitedPreviously"))
    {
        openInstructionsModal();
        localStorage.setItem("visitedPreviously", true);
    }

    // load
    await loadData();

    // check if there are search parameters in the URL
    const queryString = window.location.search;
    if (queryString) 
    {
        // get word and score from word
        const urlParams = new URLSearchParams(queryString);
        const word = urlParams.get("word");
        const score = urlParams.get("score");
        const guesses = urlParams.get("guesses");

        // delete score and guesses parameter after processing
        updateSearchParam("score", "");
        updateSearchParam("guesses", "");

        // decode friend guesses
        if (guesses)
        {
            friendGuesses = decodeFriendGuesses(decodeURIComponent(guesses));
        }

        // if the score is a number, store it under friendScore
        if (!isNaN(score))
        {
            friendScore = parseInt(score, 10);
        }

        // if the word is a valid word, play it
        if (word && word in data)
        {
            displayWord(word, friendScore);
        }
        // otherwise display a random word
        else
        {
            selectRandomWord();
        }
    }
    // if there are none, jiust choose a random
    else
    {
        // select a random word when the data loads
        selectRandomWord();
    }

    // bind button click actions
    tryAgainBtn.onclick = resetGuesses;
    shareBtn.onclick = share;
    newWordBtn.onclick = getNewWord;
    openInstructionsEl.onclick = openInstructionsModal;
})();

/**
 * Load all the collocation data in the background.
 */
async function loadData() {
    // get a random letter to start out with
    const randomLetter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const remainingLetters = ALPHABET.replace(randomLetter, "");

    // load the data of the random letter synchronously to get a word to start
    const response = await fetch(`/collocation-feud/data/${randomLetter}.csv`);
    const text = await response.text();

    // check to see if data loads
    if (response.status == 200) {
        parseData(text.split("\n").map(x => x.split(",")));
    }

    // load the remaining letter data asynchronously
    remainingLetters.split("")
        .forEach(letter => {
            fetch(`/collocation-feud/data/${letter}.csv`)
                .then(response => {
                    if (response.status != 200) {
                        throw new Error("Could not load data");
                    }

                    return response.text();
                })
                .then(text => {
                    console.log("test");
                    parseData(text.split("\n").map(x => x.split(",")))
                })
                .catch(err => console.error(err));
        });
}

/**
 * Check the word mutal information data for the user's guess and update the guess board 
 * and/or the score.
 * @param {Object[]} data 
 * @param {String} guess
 */
function guessWord(wordData, guess) {
    // if there are still guesses left
    if (currentCellIndex < guessBoardCells.length)
    {
        // add guess to guess array
        userGuesses.push(guess);

        // get the user's guess and find it was in the collocation corpus
        const hit = wordData.find(x => x.assoc == guess);

        // check if the table is full or not
        const currentCell = guessBoardCells[currentCellIndex];
        const nextCell = currentCell + 1 != guessBoardCells.length - 1 ? guessBoardCells[currentCellIndex + 1] : null;
        currentCellIndex++;

        // if there is a next cell, move the guess input to that cell
        if (nextCell) 
        {
            nextCell.appendChild(currentCell.removeChild(inputEl));
            inputEl.focus();
        }

        // if the guess word is in the assoications array
        if (hit)
        {
            // show the guess and the collocation mutal information
            currentCell.innerHTML = `
                <p>${guess} <span style="float: right">${hit.info}</span></p>
            `;

            // increase the score display
            userScore += parseInt(hit.info, 10);
            scoreEl.innerText = numberWithCommas(userScore);
        }
        else
        {
            // show the guess with an X next to it to show the user that the guess was incorrect
            currentCell.innerHTML = `
                <p>${guess} <span style="float: right">X</span></p>
            `;
        }

        // if there is no next cell, then we have no more guesses, and the game is over
        if (!nextCell) 
        {
            // show the collocation information stats
            showInformationStats(wordData);

            // if playing against a friend, reveal their guesses
            if (friendGuesses && friendGuesses.length) 
            {
                showFriendGuesses(wordData);
            }

            // if you beat your friend score, show confetti
            if (userScore > friendScore) 
            {
                new JSConfetti().addConfetti({
                    emojis: ["🎉", "🏆"]
                });
            }
        }
    }

    // clear the guess input
    inputEl.value = "";
}

/**
 * Get a new word.
 */
function getNewWord() {
    // reset guesses
    resetGuesses();

    // reset friendScore
    friendScore = 0;
    updateSearchParam("score", "");
    friendScoreEl.parentNode.style.display = "none";

    // reset friendGuesses
    friendGuesses = [];

    // get new random word
    selectRandomWord(data);
}

/**
 * Display a particular word.
 * @param {Object} data 
 * @param {String} word 
 * @param {Number} score 
 */
function displayWord(word, score) {
    // clear the board and score
    resetGuesses();

    // display the word to user
    currentWord = word;
    wordEl.innerText = word;
    
    // bind the guess word function to the enter key on input element
    bindGuessChecker(data[word]);

    // if there is a friend score in the URL, display it
    if (score && !isNaN(score))
    {
        // display friend score
        friendScoreEl.parentNode.style.display = "";

        // set friend score to whatever it was from the URL
        friendScoreEl.innerText = numberWithCommas(score);
    }
}

/**
 * Select a random word from the dataset to show.
 */
function selectRandomWord() {
    // clear the board and score
    resetGuesses();

    if (Object.keys(data).length === 0) {
        wordEl.innerText = "ERROR: Could not load word data";

        return;
    }

    // get random word
    const key = Object.keys(data)[Math.floor(Math.random() * Object.keys(data).length)];
    
    // display word to user
    currentWord = key;
    wordEl.innerText = key;

    // bind the guess word function to the enter key on input element
    bindGuessChecker(data[key]);

    // update the word URL search parameter for better sharing
    updateSearchParam("word", key);
}

/**
 * Reset the guess board and user score.
 */
function resetGuesses() {
    // clear the guesses table
    guessBoardCells
        .forEach(x => {
            if (x.innerText)
            {
                x.innerText = "";
            }
        });

    // reset current cell to first cell
    currentCellIndex = 0;

    // move the inputEl
    guessBoardCells[currentCellIndex].appendChild(inputEl);

    // clear the info stats list
    infoStatsEl.innerHTML = "";

    // focus on input el
    inputEl.focus();

    // reset the user score
    userScore = 0;
    scoreEl.innerText = userScore;
}

/**
 * Show the guesses of the friend compared to the one's that the user has done.
 * @param {Object} data 
 */
function showFriendGuesses(wordData) {
    // get all table cells
    const cells = [...board.querySelectorAll("td")];

    // go through all friend guesses
    for (let i = 0; i < friendGuesses.length; i++)
    {
        // get the user guess for that table cell
        const guess = friendGuesses[i];

        // show friend guesses and their mutal information in the color blue
        const hit = wordData.find(x => x.assoc == guess);
        if (hit)
        {
            cells[i].innerHTML += `<p><span style="color: blue">${guess}</span><span style="float: right">${hit.info}</span></p>`;
        }
        else
        {
            cells[i].innerHTML += `<p><span style="color: blue">${guess}</span><span style="float: right">X</span></p>`;
        }
    }
}

/**
 * Show the data about the mutual information of the word collocations.
 * @param {Object[]} wordData 
 */
function showInformationStats(wordData) {
    wordData
        .sort((a, b) => b.info - a.info)
        .forEach(x => {
            const li = document.createElement("li");
            li.innerText = `${x.assoc} - ${x.info}`;

            infoStatsEl.appendChild(li);
        });
}

/**
 * Share the link to the word and user score.
 */
function share() {
    // encode userGuesses
    const encodedGuesses = encodeUserGuesses(userGuesses);

    // update searchParams for URL
    updateSearchParam("score", userScore);
    updateSearchParam("guesses", encodedGuesses);

    // if the user is in mobile, we can use the Share API
    if (navigator.share)
    {
        // share message via Share API
        navigator.share({
            title: "Collocation Feud",
            text: `Play against me in Collocation Feud! The word is: ${currentWord}`,
            url: window.location.href
        })
        .then(() => {
            // delete searchParams from URL
            updateSearchParam("score", "");
            updateSearchParam("guesses", "");
        })
    }
    // otherwise, we will just copy to the clipboard
    else
    {
        // build share message
        const text = `Play against me in Collocation Feud! The word is: ${currentWord}\n${window.location.href}`;

        // copy text to clipboard
        navigator.clipboard.writeText(text)
            .then(() => {
                alert("Share URL copied to clipboard successfully!");

                // delete searchParams from URL
                updateSearchParam("score", "");
                updateSearchParam("guesses", "");
            });
    }
}

function openInstructionsModal() {
    modal.style.display = "block";
}

function closeInstructionsModal() {
    modal.style.display = "none";
}

/**
 * Update a URL search parameter without reloading the page.
 * From: https://stackoverflow.com/questions/5999118/how-can-i-add-or-update-a-query-string-parameter
 * @param {String} param 
 * @param {String} value 
 */
function updateSearchParam(param, value) {
    // create search parameters object
    const searchParams = new URLSearchParams(window.location.search);

    // if value is blank, delete the search parameter
    if (value == "")
    {
        searchParams.delete(param);
    }
    // update the search parameter
    else
    {
        // encode the word to be URL safe and set as URL search parameter
        searchParams.set(param, encodeURIComponent(value));
    }

    // use history API to not cause page reload on URL search parameter change
    const newRelativePathQuery = window.location.pathname + "?" + searchParams.toString();
    history.pushState(null, "", newRelativePathQuery);
}

/**
 * Encode the guesses with a Caeser cipher.
 * Credit: https://gist.github.com/EvanHahn/2587465
 * @param {String[]} decodedGuesses 
 * @returns {String} encodedGuesses
 */
function encodeUserGuesses(decodedGuesses) {
    return decodedGuesses.map(guess => {
        return guess
            .split("")
            .map(letter => {
                // if is letter, shift by amount
                if (letter.match(/[a-z]/i))
                {
                    return String.fromCharCode(((letter.charCodeAt(0) - 97 + SHIFT) % 26) + 97)
                }
                // otherwise, leave it be
                else
                {
                    return letter;
                }
            })
            .join("");
    }).join(",");
}

/**
 * Decode the encoded user guesses.
 * From: http://www.code2succeed.com/caesar-decryption-of-string-using-javascript/
 * @param {String} encodedGuesses 
 * @returns {String[]} decodedGuesses
 */
function decodeFriendGuesses(encodedGuesses) {
    return encodedGuesses.split(",")
        .map(guess => {
            return guess
                .split("")
                .map(letter => {
                    // if is letter, shift by amount
                    if (letter.match(/[a-z]/i))
                    {
                        return String.fromCharCode(((letter.charCodeAt(0) - 97 - SHIFT + 26) % 26) + 97)
                    }
                    // otherwise, leave it be
                    else
                    {
                        return letter;
                    }
            }).join("");
        });
}

/**
 * On input keydown, do the guess checking function for that word.
 * @param {Object[]} data 
 */
function bindGuessChecker(wordData) {
    // focus on input el
    inputEl.focus();

    // attach key listener
    inputEl.onkeydown = e => {
        // get the user guess from the input
        const guess = inputEl.value.trim().toLowerCase();

        // on enter keydown
        if (e.key == "Enter")
        {
            // make sure that the input has characters in order to guess
            if (guess)
            {
                guessWord(wordData, guess);
            }
        }
    }
}

/**
 * Parse collocation data from sparse CSV into JS object.
 * @param {Object[]} arr 
 * @returns {Object} data
 */
function parseData(arr) {
    let currentWord;

    for (const entry of arr)
    {
        const [ word, assoc, info ] = entry;

        if (word)
        {
            currentWord = word;
        }

        if (!data[currentWord])
        {
            data[currentWord] = [];
        }
        
        data[currentWord].push({
            assoc: assoc,
            info: info
        });
    }
}

/**
 * From: https://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript
 * @param {Number} x 
 * @returns {String}
 */
function numberWithCommas(x) {
    return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
}