const letters = "abcdefghijklmnopqrstuvwxyz".split("");

const hasLocalStorage = checkForLocalStorage();

const dataLocation = "first-last";

const defaultState = {
    "firstLetter": null,
    "lastLetter": null,
    "userName": null,
    "minWordLength": 3,
    "gameRunning": false,
    "isResumedGame": false
};

const state = getStateFromLocalStorage();

const userWelcomeEl = document.getElementById("userWelcome");

const firstLetterEl = document.getElementById("firstLetter");
const lastLetterEl = document.getElementById("lastLetter");
const guessTimeEl = document.getElementById("guessTime");

const userInputEl = document.getElementById("userGuess");
const startGameBtn = document.getElementById("startGame");
const shareGameBtn = document.getElementById("shareGame");
const endGameBtn = document.getElementById("endGame");

// wait for page content to be there before potentially prompting for better UX
window.addEventListener("load", () => {
    greetUser();

    // check if there are search parameters in the URL
    // a shared link will override a user's local game
    const queryString = window.location.search;
    if (queryString) {
        const urlParams = new URLSearchParams(queryString);

        // base64 decode and split letter pair into first-last
        const [sharedFirstLetter, sharedLastLetter] = atob(urlParams.get("pairID")).split("");

        // set the letters from the shared link
        setState("firstLetter", sharedFirstLetter);
        setState("lastLetter", sharedLastLetter);

        // get time to beat from shared link
        setState("timeToBeat", parseInt(urlParams.get("timeToBeat"), 10));

        // set minWordLength so operating under same rules
        setState("minWordLength", parseInt(urlParams.get("minWordLength"), 10));

        // clear search params
        updateSearchParam("pairID", "");
        updateSearchParam("timeToBeat", "");
        updateSearchParam("minWordLength", "");

        // make sure to override user's local game
        setState("isResumedGame", false);

        // start a shared game
        setState("isSharedGame", true);
        setState("gameRunning", true);
    }
    // resume game state if saved
    else {
        if (state.gameRunning) {
            setState("isResumedGame", true);

            // set state 
            setState("gameRunning", true);
        }
    }

    // min word
    setState("minWordLength", state.minWordLength);

    // bind enter key listener to user guess input
    userInputEl.onkeyup = e => {
        // do not react if there is not a game running
        if (!state.gameRunning) return;

        // TODO save userGuess in global state

        if (e.key == "Enter") {
            // do not react if there isn't any valuable user input
            if (e.target.value.trim() === "") return;

            setState("userInput", e.target.value);

            // clear input
            e.target.value = "";
        }
    }

   bindButtonActions();
});

/**
 * Get user name and greet them if they are playing a single-player game.
 */
function greetUser() {
    // get user name
    if (state.userName) {
        setState("userName", state.userName, {
            isReturning: true
        });
    }
    else {
        const userName = promptUser("What is your name?");
        setState("userName", userName, {
            isReturning: false
        });
    }
}

/**
 * Create button action click listeners and attach functions.
 */
function bindButtonActions() {
    // bind start game click listener
    startGameBtn.onclick = () => setState("gameRunning", true);

    // bind end game click listener
    endGameBtn.onclick = () => {
        // stop game and do not allow resumption
        setState("gameRunning", false);
    };

    shareGameBtn.onclick = shareGame;

    document.getElementById("incMinWordLength").onclick = () => {
        if (state.isSharedGame) {
            createToast("Illegal action", "You cannot change the minimum word length during a shared game.");

            return;
        }

        setState("minWordLength", ++state.minWordLength);
    }

    document.getElementById("decMinWordLength").onclick = () => {
        if (state.isSharedGame) {
            createToast("Illegal action", "You cannot change the minimum word length during a shared game.");

            return;
        }

        setState("minWordLength", --state.minWordLength);
    }
}

/**
 * Start or resume single player game or start shared game.
 */
function startOrResumeGame() {
    // clear game win state if we are coming off of just winning a game
    // if a game is starting, obviously we cannot have won yet
    setState("gameWon", false);

    // make sure share game button is hidden
    shareGameBtn.classList.add("d-none");

    // resume game
    if (state.isResumedGame) {
        // resume clock at saved time
        setState("gameElapsedSeconds", state.gameElapsedSeconds);

        // resume from saved letters
        setState("firstLetter", state.firstLetter);
        setState("lastLetter", state.lastLetter);
    }
    // start new game
    else {
        // start clock at 0
        setState("gameElapsedSeconds", 0);

        // generate new letters if is single-player game
        if (!state.isSharedGame) {
            // generate first and last letters for the game
            setState("firstLetter", getRandomLetter());
            setState("lastLetter", getRandomLetter());
        }
    }
}

function shareGame() {
    // encode first and last letters to prevent cheating
    updateSearchParam(
        "pairID", 
        btoa(state.firstLetter + state.lastLetter)
    );

    // add the game time so we know who can win
    updateSearchParam("timeToBeat", state.gameElapsedSeconds);

    // add minWordLength too so its same rules
    updateSearchParam("minWordLength", state.minWordLength);

    if (navigator.share) {
        // share message via Share API
        navigator.share({
            title: "First Last",
            text: `Play against me in First Last! My time was: ${getTimeString(state.gameElapsedSeconds)}`,
            url: window.location.href
        })
        .then(() => {
            // delete searchParams from URL
            updateSearchParam("pairID", "");
            updateSearchParam("timeToBeat", "");
            updateSearchParam("minWordLength", "");
        });
    }
}

/**
 * Create a Bootstrap toast element and show it.
 * @param {string} title 
 * @param {string} message 
 */
function createToast(title, message) {
    const toast = document.createElement("div");
    toast.className = "toast";

    toast.innerHTML = `
        <div class="toast-header">
            <strong class="me-auto">${title}</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>

        <div class="toast-body">
            ${message}
        </div>
    `;

    document.getElementById("toastContainer").appendChild(toast);

    const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toast);
    toastBootstrap.show();
}

/**
 * Update a state value and sync saved state.
 * @param {string} key 
 * @param {any} value 
 * @param {object} config
 */
function setState(key, value, config) {
    // update state
    state[key] = value;

    // handle state change
    if (key == "userName") {
        const isReturning = config?.isReturning;

        // populate and show user welcome message
        userWelcomeEl.textContent = `Welcome${isReturning ? ' back' : ''}, ${state.userName}!`;
        userWelcomeEl.classList.remove("d-none");
    }
    else if (key == "firstLetter") {
        firstLetterEl.textContent = value;
    }
    else if (key == "lastLetter") {
        lastLetterEl.textContent = value;
    }
    else if (key == "minWordLength") {
        document.getElementById("minWordLength").textContent = value;
    }
    else if (key == "userInput") {
        // strip whitespace for better UX
        value = value.trim();

        const isLongEnough = value.length > state.minWordLength;
        if (!isLongEnough) {
            createToast(
                "Word not long enough", 
                `Your word must be longer than ${state.minWordLength} letter${state.minWordLength > 1 ? 's' : ''}.`
            );
        }

        const startsWithLetter = value.startsWith(state.firstLetter);
        if (!startsWithLetter) {
            createToast(
                "Incorrect starting letter",
                `Your word must start with the letter "${state.firstLetter}".`
            );
        }

        const endsWithLetter = value.endsWith(state.lastLetter);
        if (!endsWithLetter) {
            createToast(
                "Incorrect ending letter",
                `Your word must end with the letter "${state.lastLetter}".`
            );
        }

        if (isLongEnough && startsWithLetter && endsWithLetter) {
            setState("gameRunning", false);
            setState("gameWon", true);
        }
    }
    else if (key == "gameRunning") {
        // if starting new game
        if (value) {
            // hide game over screen
            document.getElementById("gameOver").classList.add("d-none");

            startGameBtn.classList.add("d-none");
            endGameBtn.classList.remove("d-none");

            startOrResumeGame();

            // start the timer
            const timerID = setInterval(() => {
                setState("gameElapsedSeconds", ++state.gameElapsedSeconds);
            }, 1000);

            setState("timerID", timerID);

            // autofocus on the guess element for quicker user input
            userInputEl.focus();
        }
        else {
            startGameBtn.classList.remove("d-none");
            endGameBtn.classList.add("d-none");

            // do not allow to resume game
            setState("isResumedGame", false);

            // clear shared state
            setState("isSharedGame", false);

            // stop timer
            clearInterval(state.timerID);
        }
    }
    else if (key == "gameWon") {
        if (value) {
            // create congratulatory confetti 
            new JSConfetti().addConfetti({
                emojis: ["🎉", "🏆"]
            });

            // show share game button
            shareGameBtn.classList.remove("d-none");

            // show game over screen
            document.getElementById("gameOver").classList.remove("d-none");

            // show winning word
            document.getElementById("winningWord").textContent = state.userInput;
        }
    }
    else if (key == "gameElapsedSeconds") {
        // update timer display
        guessTimeEl.textContent = getTimeString(value) ;
    }
    else if (key == "timeToBeat") {
        // hide user welcome
        userWelcomeEl.classList.remove("d-none");

        // show opponent time
        document.getElementById("opponentTime").classList.remove("d-none");

        // update time to beat
        document.getElementById("timeToBeat").textContent = getTimeString(value);
    }

    // save state
    saveStateToLocalStorage();
}

function getTimeString(time) {
    // guesses should not be in the magnitude of hours (or really minutes)
    // so we only care about mins and seconds
    const minutes = Math.floor(time / 60);
    const seconds = time - minutes * 60;

    // left pad seconds for aesthetics
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get the application state from localStorage.
 * @returns {object} state
 */
function getStateFromLocalStorage() {
    if (hasLocalStorage) {
        if (localStorage.getItem(dataLocation) === null) {
            return defaultState;
        }

        return JSON.parse(localStorage.getItem(dataLocation));
    }
    else {
        return defaultState;
    }
}

/**
 * Saves the application state to localStorage.
 * @returns {boolean} didSaveState
 */
function saveStateToLocalStorage() {
    if (hasLocalStorage) {
        localStorage.setItem(dataLocation, JSON.stringify(state));
        
        return true;
    }

    return false;
}

/**
 * Check if localStorage exist and is available.
 * https://stackoverflow.com/questions/16427636/check-if-localstorage-is-available/16427747
 * @return {Boolean} localStorageExists
 */
function checkForLocalStorage(){
    const test = "test";

    try {
        localStorage.setItem(test, test);
        localStorage.removeItem(test);

        return true;
    } catch(e) {
        return false;
    }
}

/**
 * Make sure the user actually answers the window prompt.
 * @param {string} userPrompt 
 * @returns {string} response
 */
function promptUser(userPrompt) {
    let response = "";

    while (response.trim() === "") {
        response = prompt(userPrompt);
    }

    return response;
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
        searchParams.set(param, value);
    }

    // use history API to not cause page reload on URL search parameter change
    const newRelativePathQuery = window.location.pathname + "?" + searchParams.toString();
    history.pushState(null, "", newRelativePathQuery);
}

/**
 * Get a random letter.
 * @returns {string} letter
 */
function getRandomLetter() {
    return letters[Math.floor(Math.random() * letters.length)];
}