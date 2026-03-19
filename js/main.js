/* main.js
 * Author: Aleesha Abdullah
 * Description: Main game controller for BFS Funnel. Handles splash animation, game phases, BFS animation, wall budget system, scoring, localStorage history, and all DOM interactions.
 * Date: March 18, 2026 */

window.addEventListener('load', () => {

    // Game constants
    const ROWS        = 12;
    const COLS        = 12;
    const MAX_ROUNDS  = 5;
    const STORAGE_KEY      = 'pathfinder_best';
    const STORAGE_HISTORY = 'pathfinder_history';

    // Wall budget per round. On a 12×12 grid, Math.floor((ROWS + COLS) / 2) = 12 walls. Enough to meaningfully funnel BFS, but not enough to trivially wall the entire corridor. Players must choose placements carefully.
    const WALL_BUDGET = Math.floor((ROWS + COLS) / 2); // 12

    // Fixed (start, end) pairs per round. One challenge per round (consistent across all players so scores are comparable).
    const ROUND_POSITIONS = [
        { start: [0,  0],  end: [11, 11] }, // Diagonal: top-left to bottom-right
        { start: [0,  11], end: [11, 0]  }, // Diagonal: top-right to bottom-left
        { start: [0,  5],  end: [11, 5]  }, // Straight down the middle
        { start: [5,  0],  end: [5,  11] }, // Straight across the middle
        { start: [2,  2],  end: [9,  9]  }, // Inner diagonal
    ];

    // State
    let grid        = null;
    let pathfinder  = null;
    let round       = 0;
    let scores      = [];
    let phase       = 'wall'; // 'wall' | 'done' (start/end are now fixed)
    let animating   = false;
    let helpVisible = false;
    let wallCount   = 0;
    let minExplored = 0; // Open-grid path length; lower bound on BFS exploration (not guaranteed attainable with 12 walls)

    // Element refs
    const splashScreen   = document.getElementById('splash-screen');
    const splashCanvas   = document.getElementById('splash-canvas');
    const startButton    = document.getElementById('start-button');
    const gameScreen     = document.getElementById('game-screen');
    const gameCanvas     = document.getElementById('game-canvas');
    const phaseIndicator = document.getElementById('phase-indicator');
    const roundLabel     = document.getElementById('round-label');
    const scoreDisplay   = document.getElementById('score-display');
    const wallDisplay    = document.getElementById('wall-display');
    const findPathBtn    = document.getElementById('find-path-button');
    const helpBtn        = document.getElementById('help-button');
    const helpPanel      = document.getElementById('help-panel');
    const resultScreen   = document.getElementById('result-screen');
    const roundScoreEl   = document.getElementById('round-score');
    const roundDetailEl  = document.getElementById('round-detail');
    const targetScoreEl  = document.getElementById('target-score');
    const scoreBar       = document.getElementById('score-bar');
    const nextRoundBtn   = document.getElementById('next-round-button');
    const endScreen      = document.getElementById('end-screen');
    const totalScoreEl   = document.getElementById('total-score');
    const personalBestEl = document.getElementById('personal-best');
    const roundHistoryEl = document.getElementById('round-history');
    const playAgainBtn   = document.getElementById('play-again-button');

    // Splash animation
    const splashCtx  = splashCanvas.getContext('2d');
    const S_ROWS = 10, S_COLS = 10;

    const COLOUR_SURFACE = '#1a1d2e';
    const COLOUR_BORDER  = '#2e3250';
    const COLOUR_START   = '#22c55e';
    const COLOUR_END     = '#ef4444';
    const COLOUR_VISITED = '#fbbf24';
    const COLOUR_PATH    = '#38bdf8';
    const COLOUR_DOT     = '#4f8ef7';

    /**
     * Sets the splash canvas size to match its CSS width before drawing.
     */
    function initSplashCanvas() {
        const size = splashCanvas.offsetWidth || 320;
        splashCanvas.width  = size;
        splashCanvas.height = size;
    }

    /**
     * Draws the splash grid, colouring cells by BFS state.
     * @param {Set} visitedSet - Cell keys BFS has explored.
     * @param {Set} pathSet - Cell keys on the traced path.
     * @param {number} dotRow - Row of the moving dot (-1 to hide).
     * @param {number} dotCol - Column of the moving dot (-1 to hide).
     */
    function drawSplashGrid(visitedSet, pathSet, dotRow, dotCol) {
        const ctx = splashCtx;
        const W   = splashCanvas.width;
        const H   = splashCanvas.height;
        const cw  = W / S_COLS;
        const ch  = H / S_ROWS;

        ctx.clearRect(0, 0, W, H);

        const walls = new Set([
            '1,2','1,3','1,4','2,4','3,4','3,5','3,6',
            '4,6','5,6','5,5','5,4','6,4','6,3','7,3',
            '7,4','7,5','7,6','7,7','6,7','5,7','4,7',
            '4,8','3,8','2,8','2,7','2,6'
        ]);

        for (let r = 0; r < S_ROWS; r++) {
            for (let c = 0; c < S_COLS; c++) {
                const key       = `${r},${c}`;
                const isStart   = r === 0 && c === 0;
                const isEnd     = r === S_ROWS - 1 && c === S_COLS - 1;
                const isWall    = walls.has(key);
                const isPath    = pathSet.has(key);
                const isVisited = visitedSet.has(key);

                if (isStart)        ctx.fillStyle = COLOUR_START;
                else if (isEnd)     ctx.fillStyle = COLOUR_END;
                else if (isWall)    ctx.fillStyle = '#374151';
                else if (isPath)    ctx.fillStyle = COLOUR_PATH;
                else if (isVisited) ctx.fillStyle = COLOUR_VISITED;
                else                ctx.fillStyle = COLOUR_SURFACE;

                ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
                ctx.strokeStyle = COLOUR_BORDER;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
            }
        }

        if (dotRow >= 0 && dotCol >= 0) {
            ctx.fillStyle = COLOUR_DOT;
            ctx.beginPath();
            ctx.arc(
                dotCol * cw + cw / 2,
                dotRow * ch + ch / 2,
                Math.min(cw, ch) * 0.28,
                0, Math.PI * 2
            );
            ctx.fill();
        }
    }

    /**
     * Runs BFS on the splash grid and animates visited cells then the path.
     * Reveals the Start button when the animation finishes.
     */
    function runSplashAnimation() {
        initSplashCanvas();

        const walls = new Set([
            '1,2','1,3','1,4','2,4','3,4','3,5','3,6',
            '4,6','5,6','5,5','5,4','6,4','6,3','7,3',
            '7,4','7,5','7,6','7,7','6,7','5,7','4,7',
            '4,8','3,8','2,8','2,7','2,6'
        ]);

        const parentMap    = {};
        const visitedOrder = [];
        const queue        = [{ r: 0, c: 0 }];
        const seen         = new Set(['0,0']);
        const dr = [-1, 1, 0, 0];
        const dc = [0, 0, -1, 1];

        while (queue.length > 0) {
            const { r, c } = queue.shift();
            visitedOrder.push([r, c]);
            if (r === S_ROWS - 1 && c === S_COLS - 1) break;
            for (let d = 0; d < 4; d++) {
                const nr  = r + dr[d];
                const nc  = c + dc[d];
                const key = `${nr},${nc}`;
                if (nr >= 0 && nr < S_ROWS && nc >= 0 && nc < S_COLS
                        && !seen.has(key) && !walls.has(key)) {
                    seen.add(key);
                    parentMap[key] = `${r},${c}`;
                    queue.push({ r: nr, c: nc });
                }
            }
        }

        const pathNodes = [];
        let cur = `${S_ROWS - 1},${S_COLS - 1}`;
        while (cur && cur !== '0,0') {
            pathNodes.unshift(cur);
            cur = parentMap[cur];
        }
        pathNodes.unshift('0,0');
        const pathSet    = new Set(pathNodes);
        const visitedSet = new Set();
        let step = 0;

        const visitInterval = setInterval(() => {
            if (step < visitedOrder.length) {
                const [r, c] = visitedOrder[step];
                visitedSet.add(`${r},${c}`);
                drawSplashGrid(visitedSet, new Set(), r, c);
                step++;
            } else {
                clearInterval(visitInterval);
                let pStep = 0;
                const revealedPath = new Set();
                const pathInterval = setInterval(() => {
                    if (pStep < pathNodes.length) {
                        revealedPath.add(pathNodes[pStep]);
                        const [pr, pc] = pathNodes[pStep].split(',').map(Number);
                        drawSplashGrid(visitedSet, revealedPath, pr, pc);
                        pStep++;
                    } else {
                        clearInterval(pathInterval);
                        drawSplashGrid(visitedSet, pathSet, -1, -1);
                        startButton.classList.remove('hidden');
                    }
                }, 60);
            }
        }, 40);
    }

    runSplashAnimation();

    // Start button
    startButton.addEventListener('click', () => {
        splashScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        initGame();
    });

    /**
     * Resets round counter, scores, and pathfinder, then starts round 1.
     */
    function initGame() {
        round      = 0;
        scores     = [];
        pathfinder = new Pathfinder();
        updateScoreDisplay();
        startRound();
    }

    // Target score computation
    let computerScore    = 0;
    let computerExplored = 0;

    /**
     * Greedy solver that finds the best wall placement with WALL_BUDGET walls.
     * Sets minExplored, computerScore, and computerExplored for use in endRound.
     * @param {number} sr - Start row.
     * @param {number} sc - Start column.
     * @param {number} er - End row.
     * @param {number} ec - End column.
     */
    function computeOptimalWalls(sr, sc, er, ec) {
        const startKey = `${sr},${sc}`;
        const endKey   = `${er},${ec}`;

        /**
         * Runs BFS from start to end, treating wallSet entries as blocked cells.
         * @param {Set} wallSet - String keys of walled cells in "row,col" format.
         * @returns {{ visited: string[], path: string[] }} Explored cells and shortest path.
         */
        function bfsOnWalls(wallSet) {
            const visited = [];
            const parent  = {};
            const seen    = new Set([startKey]);
            const queue   = [[sr, sc]];
            const dr = [-1, 1, 0, 0];
            const dc = [0, 0, -1, 1];

            while (queue.length > 0) {
                const [r, c] = queue.shift();
                const key = `${r},${c}`;
                visited.push(key);
                if (r === er && c === ec) {
                    const path = [];
                    let cur = key;
                    while (cur) { path.unshift(cur); cur = parent[cur]; }
                    return { visited, path };
                }
                for (let d = 0; d < 4; d++) {
                    const nr = r + dr[d], nc = c + dc[d];
                    const nk = `${nr},${nc}`;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS
                            && !seen.has(nk) && !wallSet.has(nk)) {
                        seen.add(nk);
                        parent[nk] = key;
                        queue.push([nr, nc]);
                    }
                }
            }
            return { visited, path: [] };
        }

        // Open-grid path length = lower bound on BFS exploration. BFS must visit every cell on the shortest path at minimum.
        // Note: This is not guaranteed attainable under the 12-wall budget.
        const { path: openPath } = bfsOnWalls(new Set());
        minExplored = openPath.length;

        const placedWalls = new Set();

        for (let w = 0; w < WALL_BUDGET; w++) {
            const { visited: curVisited, path: curPath } = bfsOnWalls(placedWalls);
            if (curPath.length === 0) break;

            const pathSet = new Set(curPath);
            let bestWall     = null;
            let bestExplored = curVisited.length;

            for (const key of curVisited) {
                if (pathSet.has(key) || key === startKey || key === endKey) continue;
                if (placedWalls.has(key)) continue;

                placedWalls.add(key);
                const { visited: tv, path: tp } = bfsOnWalls(placedWalls);
                placedWalls.delete(key);

                if (tp.length > 0 && tv.length < bestExplored) {
                    bestExplored = tv.length;
                    bestWall     = key;
                }
            }

            if (bestWall === null) break;
            placedWalls.add(bestWall);
        }

        const { visited: finalVisited } = bfsOnWalls(placedWalls);
        computerExplored = finalVisited.length;
        computerScore    = Math.min(100, Math.round((minExplored / computerExplored) * 100));
    }

    /**
     * Sets up a new round with fixed start/end nodes and a fresh grid.
     * Runs the greedy solver to set the computer reference score.
     */
    function startRound() {
        round++;
        phase     = 'wall';
        animating = false;
        wallCount = 0;
        grid      = new Grid(ROWS, COLS);

        const pos = ROUND_POSITIONS[(round - 1) % ROUND_POSITIONS.length];
        grid.setStart(pos.start[0], pos.start[1]);
        grid.setEnd(pos.end[0],     pos.end[1]);

        computeOptimalWalls(pos.start[0], pos.start[1], pos.end[0], pos.end[1]);

        resultScreen.classList.add('hidden');
        helpPanel.classList.add('hidden');
        helpVisible = false;
        helpBtn.textContent = 'Help';
        findPathBtn.disabled = false;

        roundLabel.textContent = `Round ${round} / ${MAX_ROUNDS}`;
        updateScoreDisplay();
        updateWallDisplay();
        setPhaseText(`Use up to ${WALL_BUDGET} walls to funnel BFS toward the end.`);
        drawGrid();
    }

    /**
     * Updates the running total score label in the game header.
     */
    function updateScoreDisplay() {
        const total = scores.reduce((a, b) => a + b, 0);
        scoreDisplay.textContent = `Total: ${total} pts`;
    }

    /**
     * Updates the wall counter label. Turns it red when the budget is exhausted.
     */
    function updateWallDisplay() {
        wallDisplay.textContent = `Walls: ${wallCount} / ${WALL_BUDGET}`;
        wallDisplay.className   = wallCount >= WALL_BUDGET
            ? 'wall-display wall-maxed'
            : 'wall-display';
    }

    /**
     * Resizes the game canvas to match its current CSS width before drawing.
     */
    function initGameCanvas() {
        const size = gameCanvas.offsetWidth || 360;
        gameCanvas.width  = size;
        gameCanvas.height = size;
    }

    /**
     * Returns the pixel dimensions of one grid cell.
     * @returns {{ cw: number, ch: number }} Cell width and height in pixels.
     */
    function cellSize() {
        return { cw: gameCanvas.width / COLS, ch: gameCanvas.height / ROWS };
    }

    /**
     * Clears and redraws the game canvas from the current Grid model state.
     */
    function drawGrid() {
        initGameCanvas();
        const ctx = gameCanvas.getContext('2d');
        const { cw, ch } = cellSize();
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const node = grid.grid[r][c];
                if      (node.isStart)  ctx.fillStyle = '#22c55e';
                else if (node.isEnd)    ctx.fillStyle = '#ef4444';
                else if (node.isWall)   ctx.fillStyle = '#374151';
                else if (node.visited)  ctx.fillStyle = '#fbbf24';
                else                    ctx.fillStyle = '#1a1d2e';

                ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
                ctx.strokeStyle = '#2e3250';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
            }
        }
    }

    /**
     * Draws the BFS shortest path in blue on the game canvas.
     * @param {Node[]} pathNodes - Ordered array of nodes on the shortest path.
     */
    function drawPath(pathNodes) {
        const ctx = gameCanvas.getContext('2d');
        const { cw, ch } = cellSize();
        for (const node of pathNodes) {
            if (node.isStart || node.isEnd) continue;
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(node.col * cw + 1, node.row * ch + 1, cw - 2, ch - 2);
        }
    }

    /**
     * Converts a mouse or touch event into grid row and column coordinates.
     * @param {MouseEvent|TouchEvent} e - The click or touchstart event.
     * @returns {{ row: number, col: number }|null} Grid position, or null if out of bounds.
     */
    function getNodeFromEvent(e) {
        const rect    = gameCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX  = gameCanvas.width  / rect.width;
        const scaleY  = gameCanvas.height / rect.height;
        const x       = (clientX - rect.left) * scaleX;
        const y       = (clientY - rect.top)  * scaleY;
        const { cw, ch } = cellSize();
        const col = Math.floor(x / cw);
        const row = Math.floor(y / ch);
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
        return { row, col };
    }

    /**
     * Handles click and touch events on the game canvas.
     * Places or removes a wall at the tapped cell within the wall budget.
     * @param {MouseEvent|TouchEvent} e - The click or touchstart event.
     */
    function handleCanvasInteraction(e) {
        if (animating || phase === 'done') return;
        e.preventDefault();
        const pos = getNodeFromEvent(e);
        if (!pos) return;
        const { row, col } = pos;
        const node = grid.grid[row][col];

        if (node.isStart || node.isEnd) return;

        if (node.isWall) {
            // Removing a wall: always allowed, refunds one wall to budget
            grid.toggleWall(row, col);
            wallCount--;
        } else {
            // Adding a wall: blocked if budget exhausted
            if (wallCount >= WALL_BUDGET) {
                setPhaseText(`Wall limit (${WALL_BUDGET}) reached. Remove a wall first.`);
                return;
            }
            grid.toggleWall(row, col);
            wallCount++;
        }

        updateWallDisplay();
        drawGrid();
    }

    gameCanvas.addEventListener('click',      handleCanvasInteraction);
    gameCanvas.addEventListener('touchstart', handleCanvasInteraction, { passive: false });

    // Find path
    findPathBtn.addEventListener('click', () => {
        if (animating) return;

        animating = true;
        findPathBtn.disabled = true;
        setPhaseText('BFS is running...');

        const { visited, path } = pathfinder.bfs(grid);
        animateBFS(visited, path);
    });

    /**
     * Animates BFS explored cells one by one, then draws the path and ends the round.
     * @param {Node[]} visited - All nodes BFS explored, in order.
     * @param {Node[]} path - Nodes on the shortest path, in order.
     */
    function animateBFS(visited, path) {
        let i = 0;
        const interval = setInterval(() => {
            if (i < visited.length) {
                const node = visited[i];
                if (!node.isStart && !node.isEnd) {
                    const ctx = gameCanvas.getContext('2d');
                    const { cw, ch } = cellSize();
                    ctx.fillStyle = '#fbbf24';
                    ctx.fillRect(node.col * cw + 1, node.row * ch + 1, cw - 2, ch - 2);
                }
                i++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    drawPath(path);
                    setTimeout(() => endRound(visited, path), 400);
                }, 200);
            }
        }, 30);
    }

    /**
     * Scores the round, builds the result panel, and shows the result screen.
     * @param {Node[]} visited - All nodes BFS explored this round, in order.
     * @param {Node[]} path - Shortest path nodes in order. Empty if no path found.
     */
    function endRound(visited, path) {
        animating = false;
        phase     = 'done';

        const noPath   = path.length === 0;
        const explored = visited.length;

        // Score = (minExplored / explored) × 100, capped at 100.
        // minExplored = open-grid path length (lower bound: BFS must visit at least these cells). Not guaranteed achievable under the 12-wall budget.
        // The computer's greedy score is the practical reference point.
        const score = noPath
            ? 0
            : Math.min(100, Math.round((minExplored / explored) * 100));

        scores.push(score);
        updateScoreDisplay();

        roundScoreEl.textContent = `${score} pts`;

        // Build result panel using innerHTML for block layout
        let statsHTML = '';
        let feedbackText = '';

        if (noPath) {
            feedbackText =
                'No path found. Your walls completely blocked BFS. ' +
                'BFS explores outward evenly in all directions, so if every route is walled off, it cannot reach the end.';
            statsHTML = `
                <div class="stat-row"><span class="stat-label">Cells explored</span><span class="stat-value">N/A</span></div>
                <div class="stat-row"><span class="stat-label">Path length</span><span class="stat-value">N/A</span></div>
                <div class="stat-row"><span class="stat-label">Walls used</span><span class="stat-value">${wallCount} / ${WALL_BUDGET}</span></div>
                <div class="stat-row"><span class="stat-label">Computer's best</span><span class="stat-value">${computerScore} pts (${computerExplored} cells)</span></div>
            `;
        } else {
            const gap = explored - minExplored;
            if (score >= 90) {
                feedbackText =
                    `Near-perfect! Your corridor was so tight that BFS had almost no room to spread sideways. ` +
                    `The lower bound for this layout is ${minExplored} cells and you got very close.`;
            } else if (score >= 70) {
                feedbackText =
                    `Good funneling. A few open gaps beside the path let BFS spread before it found the end. ` +
                    `Tighter walls along the sides would cut exploration further.`;
            } else if (score >= 45) {
                feedbackText =
                    `BFS expands evenly in all 4 directions, so open space beside your path is costly. ` +
                    `Try placing walls along both sides of the route, not just blocking dead ends.`;
            } else {
                feedbackText =
                    `BFS has no sense of direction. Without walls to guide it, it floods the whole grid. ` +
                    `Use your ${WALL_BUDGET} walls to build a narrow corridor from start to end.`;
            }
            statsHTML = `
                <div class="stat-row"><span class="stat-label">Your cells explored</span><span class="stat-value">${explored}</span></div>
                <div class="stat-row"><span class="stat-label">Computer's explored</span><span class="stat-value">${computerExplored} (${computerScore} pts)</span></div>
                <div class="stat-row"><span class="stat-label">Lower bound</span><span class="stat-value">${minExplored} cells</span></div>
                <div class="stat-row"><span class="stat-label">Path length</span><span class="stat-value">${path.length} cells</span></div>
                <div class="stat-row"><span class="stat-label">Walls used</span><span class="stat-value">${wallCount} / ${WALL_BUDGET}</span></div>
            `;
        }

        if (targetScoreEl) targetScoreEl.innerHTML = statsHTML;
        roundDetailEl.textContent = feedbackText;
        scoreBar.style.width = `${score}%`;
        resultScreen.classList.remove('hidden');

        nextRoundBtn.textContent = round >= MAX_ROUNDS ? 'See Results' : 'Next Round';
    }

    // Next round/end
    nextRoundBtn.addEventListener('click', () => {
        if (round >= MAX_ROUNDS) {
            showEndScreen();
        } else {
            startRound();
        }
    });

    /**
     * Shows the end screen with total score, round history, and personal best.
     * Saves round scores and personal best to localStorage for history across sessions.
     */
    function showEndScreen() {
        gameScreen.classList.add('hidden');
        endScreen.classList.remove('hidden');

        const total       = scores.reduce((a, b) => a + b, 0);
        const maxPossible = MAX_ROUNDS * 100;
        totalScoreEl.textContent = `${total} / ${maxPossible}`;

        // Save this game's round scores to localStorage
        localStorage.setItem(STORAGE_HISTORY, JSON.stringify(scores));

        // Display round history (current game)
        roundHistoryEl.innerHTML = scores
            .map((s, i) => `Round ${i + 1}: <strong>${s} pts</strong>`)
            .join('<br>');

        // Update personal best
        let best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
        if (total > best) {
            best = total;
            localStorage.setItem(STORAGE_KEY, best);
            personalBestEl.textContent = `🏆 New personal best: ${best} / ${maxPossible} pts!`;
        } else {
            personalBestEl.textContent = `Personal best: ${best} / ${maxPossible} pts`;
        }
    }

    // Play again
    playAgainBtn.addEventListener('click', () => {
        endScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        initGame();
    });

    // Help
    helpBtn.addEventListener('click', () => {
        helpVisible = !helpVisible;
        if (helpVisible) {
            helpPanel.classList.remove('hidden');
            helpBtn.textContent = 'Close Help';
        } else {
            helpPanel.classList.add('hidden');
            helpBtn.textContent = 'Help';
        }
    });

    /**
     * Updates the phase indicator with an instruction message.
     * @param {string} text - The message to display to the player.
     */
    function setPhaseText(text) {
        phaseIndicator.textContent = text;
    }

});