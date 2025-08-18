// High-performance binary heap implementation for priority queues
// Optimized for A* pathfinding and other performance-critical operations

export class BinaryHeap {
    constructor(compareFunction = null) {
        this.heap = [];
        this.size = 0;
        
        // Default comparison: min-heap based on priority property
        this.compare = compareFunction || ((a, b) => a.priority - b.priority);
    }

    // Insert element with O(log n) complexity
    insert(element) {
        this.heap[this.size] = element;
        this.bubbleUp(this.size);
        this.size++;
        return this.size;
    }

    // Remove and return minimum element with O(log n) complexity
    extractMin() {
        if (this.size === 0) return null;
        
        const min = this.heap[0];
        this.size--;
        
        if (this.size > 0) {
            this.heap[0] = this.heap[this.size];
            this.bubbleDown(0);
        }
        
        return min;
    }

    // Peek at minimum element without removing it - O(1)
    peek() {
        return this.size > 0 ? this.heap[0] : null;
    }

    // Check if heap is empty - O(1)
    isEmpty() {
        return this.size === 0;
    }

    // Get current size - O(1)
    getSize() {
        return this.size;
    }

    // Clear all elements - O(1)
    clear() {
        this.size = 0;
        this.heap.length = 0;
    }

    // Build heap from array in O(n) time
    buildFromArray(array) {
        this.heap = [...array];
        this.size = array.length;
        
        // Start from last non-leaf node and bubble down
        for (let i = Math.floor(this.size / 2) - 1; i >= 0; i--) {
            this.bubbleDown(i);
        }
    }

    // Update element priority and rebalance - O(log n)
    updatePriority(element, newPriority) {
        const index = this.findElementIndex(element);
        if (index === -1) return false;
        
        const oldPriority = this.heap[index].priority;
        this.heap[index].priority = newPriority;
        
        if (newPriority < oldPriority) {
            this.bubbleUp(index);
        } else if (newPriority > oldPriority) {
            this.bubbleDown(index);
        }
        
        return true;
    }

    // Check if element exists in heap - O(n) worst case
    contains(element) {
        return this.findElementIndex(element) !== -1;
    }

    // Get heap statistics for performance monitoring
    getStats() {
        return {
            size: this.size,
            capacity: this.heap.length,
            utilizationRatio: this.size / Math.max(1, this.heap.length),
            depth: Math.floor(Math.log2(this.size + 1)),
            isValid: this.validateHeap()
        };
    }

    // Private helper methods
    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            
            if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) {
                break;
            }
            
            this.swap(index, parentIndex);
            index = parentIndex;
        }
    }

    bubbleDown(index) {
        while (true) {
            let minIndex = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            
            if (leftChild < this.size && 
                this.compare(this.heap[leftChild], this.heap[minIndex]) < 0) {
                minIndex = leftChild;
            }
            
            if (rightChild < this.size && 
                this.compare(this.heap[rightChild], this.heap[minIndex]) < 0) {
                minIndex = rightChild;
            }
            
            if (minIndex === index) break;
            
            this.swap(index, minIndex);
            index = minIndex;
        }
    }

    swap(i, j) {
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;
    }

    findElementIndex(element) {
        for (let i = 0; i < this.size; i++) {
            if (this.heap[i] === element || 
                (this.heap[i].element && this.heap[i].element === element)) {
                return i;
            }
        }
        return -1;
    }

    // Validate heap property for debugging
    validateHeap() {
        for (let i = 0; i < this.size; i++) {
            const leftChild = 2 * i + 1;
            const rightChild = 2 * i + 2;
            
            if (leftChild < this.size && 
                this.compare(this.heap[i], this.heap[leftChild]) > 0) {
                return false;
            }
            
            if (rightChild < this.size && 
                this.compare(this.heap[i], this.heap[rightChild]) > 0) {
                return false;
            }
        }
        return true;
    }

    // Convert to array for serialization/debugging
    toArray() {
        return this.heap.slice(0, this.size);
    }

    // Create a copy of the heap
    clone() {
        const cloned = new BinaryHeap(this.compare);
        cloned.heap = [...this.heap];
        cloned.size = this.size;
        return cloned;
    }
}

// Specialized priority queue for A* pathfinding
export class PathfindingPriorityQueue extends BinaryHeap {
    constructor() {
        // Min-heap based on f-score (priority)
        super((a, b) => a.fScore - b.fScore);
        this.nodeMap = new Map(); // For O(1) node lookup
    }

    enqueue(node, fScore) {
        const item = {
            node,
            fScore,
            priority: fScore // Alias for compatibility
        };
        
        this.nodeMap.set(node.name, item);
        this.insert(item);
    }

    dequeue() {
        const item = this.extractMin();
        if (item) {
            this.nodeMap.delete(item.node.name);
            return item.node;
        }
        return null;
    }

    hasNode(node) {
        return this.nodeMap.has(node.name);
    }

    updateNodePriority(node, newFScore) {
        const item = this.nodeMap.get(node.name);
        if (item) {
            return this.updatePriority(item, newFScore);
        }
        return false;
    }

    getNodePriority(node) {
        const item = this.nodeMap.get(node.name);
        return item ? item.fScore : null;
    }

    clear() {
        super.clear();
        this.nodeMap.clear();
    }

    // Performance metrics specific to pathfinding
    getPathfindingStats() {
        return {
            ...this.getStats(),
            nodesInQueue: this.nodeMap.size,
            peekNode: this.peek()?.node?.name || null,
            averageFScore: this.calculateAverageFScore()
        };
    }

    calculateAverageFScore() {
        if (this.size === 0) return 0;
        
        let total = 0;
        for (let i = 0; i < this.size; i++) {
            total += this.heap[i].fScore;
        }
        return total / this.size;
    }
}

// Performance benchmarking utilities
export class HeapPerformanceTester {
    static async benchmarkOperations(heapClass, operationCount = 10000) {
        const results = {
            insertTime: 0,
            extractTime: 0,
            insertThroughput: 0,
            extractThroughput: 0,
            memoryUsage: 0
        };

        // Benchmark insertions
        const heap = new heapClass();
        const insertStart = performance.now();
        
        for (let i = 0; i < operationCount; i++) {
            heap.insert({
                priority: Math.random() * 1000,
                data: `item_${i}`
            });
        }
        
        results.insertTime = performance.now() - insertStart;
        results.insertThroughput = operationCount / results.insertTime * 1000; // ops/sec

        // Benchmark extractions
        const extractStart = performance.now();
        
        while (!heap.isEmpty()) {
            heap.extractMin();
        }
        
        results.extractTime = performance.now() - extractStart;
        results.extractThroughput = operationCount / results.extractTime * 1000; // ops/sec

        return results;
    }

    static async compareImplementations(operationCount = 10000) {
        console.log(`Benchmarking heap implementations with ${operationCount} operations...`);
        
        const binaryHeapResults = await this.benchmarkOperations(BinaryHeap, operationCount);
        console.log('Binary Heap Results:', binaryHeapResults);

        const pathfindingQueueResults = await this.benchmarkOperations(PathfindingPriorityQueue, operationCount);
        console.log('Pathfinding Queue Results:', pathfindingQueueResults);

        return {
            binaryHeap: binaryHeapResults,
            pathfindingQueue: pathfindingQueueResults
        };
    }
}