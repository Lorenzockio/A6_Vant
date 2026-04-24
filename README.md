You can find my vants simulation [here](https://lorenzockio.github.io/A6_Vant/). I added three new vant behavior types. 

The first type is the same as the original vants except for the fact that it does not turn unless a pheromone is found. This creates long, straight lines of pheromones across the screen. 

The second type also has only one change. When no pheromone is found, it places an additional pheromone in the direction it will turn towards. On the next frame, it will consume that pheromone and turn in the other direction, causing it to leave behind diagonal lines of pheromones. 

The final type of vant does not leave behind pheromones. It will check the surrounding spaces (front, left, right, back) for pheromones and move to the first that is found.
