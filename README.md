# Pathfinding Visualizer

A browser-based puzzle game that teaches Breadth-First Search by making you compete against it.

## Technical Highlights

- BFS pathfinding implemented from scratch with step-by-step canvas animation
- Greedy wall solver runs at the start of each round to compute a computer reference score using the same 12-wall budget
- Scoring formula: score = round(pathLength / cellsExplored x 100)
- Model/view separation using Grid, Node, and Pathfinder classes
- Mobile-first responsive design (480px)
- No libraries or frameworks (vanilla JS, HTML canvas, CSS)

## Course

COMPSCI 1XD3 - Introduction to Software Design Using Web Programming, McMaster University
