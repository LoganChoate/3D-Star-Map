// Performance monitoring and benchmarking utilities for 3D Star Map Explorer
// Provides comprehensive performance tracking and optimization recommendations

export class PerformanceMonitor {
    constructor() {
        this.metrics = {
            frameRate: {
                samples: [],
                maxSamples: 120, // 2 seconds at 60fps
                average: 0,
                min: Infinity,
                max: 0
            },
            renderTime: {
                samples: [],
                maxSamples: 60,
                average: 0
            },
            pathfinding: {
                totalCalculations: 0,
                totalTime: 0,
                averageTime: 0,
                longestCalculation: 0,
                workerCalculations: 0,
                fallbackCalculations: 0
            },
            filtering: {
                totalFilters: 0,
                totalTime: 0,
                averageTime: 0,
                lastFilterTime: 0
            },
            memory: {
                samples: [],
                maxSamples: 30,
                lastUpdate: 0
            }
        };

        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.startTime = performance.now();
        
        // Performance thresholds
        this.thresholds = {
            minFPS: 30,
            maxRenderTime: 16.67, // 60fps target
            maxPathfindingTime: 5000, // 5 seconds
            maxFilterTime: 100, // 100ms
            memoryWarningMB: 512
        };

        // Event listeners for performance issues
        this.listeners = new Map();
    }

    startMonitoring(interval = 1000) {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        console.log('Performance monitoring started');

        this.monitoringInterval = setInterval(() => {
            this.updateMemoryMetrics();
            this.checkPerformanceThresholds();
        }, interval);

        // Monitor frame rate
        this.frameRateMonitor();
    }

    stopMonitoring() {
        if (!this.isMonitoring) return;

        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        console.log('Performance monitoring stopped');
    }

    // Frame rate monitoring
    frameRateMonitor() {
        let lastTime = performance.now();
        
        const measureFrame = (currentTime) => {
            if (!this.isMonitoring) return;

            const deltaTime = currentTime - lastTime;
            const fps = 1000 / deltaTime;

            this.recordFrameRate(fps);
            lastTime = currentTime;

            requestAnimationFrame(measureFrame);
        };

        requestAnimationFrame(measureFrame);
    }

    recordFrameRate(fps) {
        const frameMetrics = this.metrics.frameRate;
        
        frameMetrics.samples.push(fps);
        if (frameMetrics.samples.length > frameMetrics.maxSamples) {
            frameMetrics.samples.shift();
        }

        frameMetrics.min = Math.min(frameMetrics.min, fps);
        frameMetrics.max = Math.max(frameMetrics.max, fps);
        frameMetrics.average = frameMetrics.samples.reduce((a, b) => a + b, 0) / frameMetrics.samples.length;
    }

    recordRenderTime(renderTime) {
        const renderMetrics = this.metrics.renderTime;
        
        renderMetrics.samples.push(renderTime);
        if (renderMetrics.samples.length > renderMetrics.maxSamples) {
            renderMetrics.samples.shift();
        }

        renderMetrics.average = renderMetrics.samples.reduce((a, b) => a + b, 0) / renderMetrics.samples.length;
    }

    recordPathfindingTime(calculationTime, usedWorker = false) {
        const pathMetrics = this.metrics.pathfinding;
        
        pathMetrics.totalCalculations++;
        pathMetrics.totalTime += calculationTime;
        pathMetrics.averageTime = pathMetrics.totalTime / pathMetrics.totalCalculations;
        pathMetrics.longestCalculation = Math.max(pathMetrics.longestCalculation, calculationTime);

        if (usedWorker) {
            pathMetrics.workerCalculations++;
        } else {
            pathMetrics.fallbackCalculations++;
        }
    }

    recordFilterTime(filterTime) {
        const filterMetrics = this.metrics.filtering;
        
        filterMetrics.totalFilters++;
        filterMetrics.totalTime += filterTime;
        filterMetrics.averageTime = filterMetrics.totalTime / filterMetrics.totalFilters;
        filterMetrics.lastFilterTime = filterTime;
    }

    updateMemoryMetrics() {
        if (!window.performance || !window.performance.memory) return;

        const memory = window.performance.memory;
        const memoryInfo = {
            used: memory.usedJSHeapSize / 1024 / 1024, // MB
            total: memory.totalJSHeapSize / 1024 / 1024, // MB
            limit: memory.jsHeapSizeLimit / 1024 / 1024, // MB
            timestamp: performance.now()
        };

        const memMetrics = this.metrics.memory;
        memMetrics.samples.push(memoryInfo);
        
        if (memMetrics.samples.length > memMetrics.maxSamples) {
            memMetrics.samples.shift();
        }

        memMetrics.lastUpdate = performance.now();
    }

    checkPerformanceThresholds() {
        const issues = [];

        // Check frame rate
        if (this.metrics.frameRate.average < this.thresholds.minFPS) {
            issues.push({
                type: 'low_framerate',
                severity: 'warning',
                message: `Low frame rate: ${this.metrics.frameRate.average.toFixed(1)}fps (target: ${this.thresholds.minFPS}fps)`,
                value: this.metrics.frameRate.average,
                threshold: this.thresholds.minFPS
            });
        }

        // Check render time
        if (this.metrics.renderTime.average > this.thresholds.maxRenderTime) {
            issues.push({
                type: 'slow_rendering',
                severity: 'warning',
                message: `Slow rendering: ${this.metrics.renderTime.average.toFixed(2)}ms (target: <${this.thresholds.maxRenderTime}ms)`,
                value: this.metrics.renderTime.average,
                threshold: this.thresholds.maxRenderTime
            });
        }

        // Check pathfinding performance
        if (this.metrics.pathfinding.longestCalculation > this.thresholds.maxPathfindingTime) {
            issues.push({
                type: 'slow_pathfinding',
                severity: 'error',
                message: `Slow pathfinding: ${this.metrics.pathfinding.longestCalculation}ms (limit: ${this.thresholds.maxPathfindingTime}ms)`,
                value: this.metrics.pathfinding.longestCalculation,
                threshold: this.thresholds.maxPathfindingTime
            });
        }

        // Check memory usage
        const latestMemory = this.metrics.memory.samples[this.metrics.memory.samples.length - 1];
        if (latestMemory && latestMemory.used > this.thresholds.memoryWarningMB) {
            issues.push({
                type: 'high_memory',
                severity: 'warning',
                message: `High memory usage: ${latestMemory.used.toFixed(1)}MB (warning: >${this.thresholds.memoryWarningMB}MB)`,
                value: latestMemory.used,
                threshold: this.thresholds.memoryWarningMB
            });
        }

        // Emit performance issues
        if (issues.length > 0) {
            this.emitEvent('performance_issues', issues);
        }
    }

    // Event system for performance notifications
    addEventListener(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);
    }

    removeEventListener(eventType, callback) {
        if (this.listeners.has(eventType)) {
            this.listeners.get(eventType).delete(callback);
        }
    }

    emitEvent(eventType, data) {
        if (this.listeners.has(eventType)) {
            this.listeners.get(eventType).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Performance monitor event listener error:', error);
                }
            });
        }
    }

    // Comprehensive performance report
    getPerformanceReport() {
        const uptime = (performance.now() - this.startTime) / 1000; // seconds
        const latestMemory = this.metrics.memory.samples[this.metrics.memory.samples.length - 1];

        return {
            uptime: uptime.toFixed(1),
            isMonitoring: this.isMonitoring,
            
            frameRate: {
                current: this.metrics.frameRate.samples[this.metrics.frameRate.samples.length - 1] || 0,
                average: parseFloat(this.metrics.frameRate.average.toFixed(1)),
                min: this.metrics.frameRate.min === Infinity ? 0 : parseFloat(this.metrics.frameRate.min.toFixed(1)),
                max: parseFloat(this.metrics.frameRate.max.toFixed(1)),
                samples: this.metrics.frameRate.samples.length
            },

            rendering: {
                averageTime: parseFloat(this.metrics.renderTime.average.toFixed(2)),
                samples: this.metrics.renderTime.samples.length,
                targetTime: this.thresholds.maxRenderTime
            },

            pathfinding: {
                totalCalculations: this.metrics.pathfinding.totalCalculations,
                averageTime: parseFloat(this.metrics.pathfinding.averageTime.toFixed(1)),
                longestCalculation: this.metrics.pathfinding.longestCalculation,
                workerUsage: this.metrics.pathfinding.totalCalculations > 0 
                    ? parseFloat((this.metrics.pathfinding.workerCalculations / this.metrics.pathfinding.totalCalculations * 100).toFixed(1))
                    : 0
            },

            filtering: {
                totalFilters: this.metrics.filtering.totalFilters,
                averageTime: parseFloat(this.metrics.filtering.averageTime.toFixed(2)),
                lastFilterTime: parseFloat(this.metrics.filtering.lastFilterTime.toFixed(2))
            },

            memory: latestMemory ? {
                used: parseFloat(latestMemory.used.toFixed(1)),
                total: parseFloat(latestMemory.total.toFixed(1)),
                usage: parseFloat((latestMemory.used / latestMemory.total * 100).toFixed(1)),
                samples: this.metrics.memory.samples.length
            } : null,

            recommendations: this.generateRecommendations()
        };
    }

    generateRecommendations() {
        const recommendations = [];

        // Frame rate recommendations
        if (this.metrics.frameRate.average < this.thresholds.minFPS) {
            recommendations.push({
                category: 'performance',
                priority: 'high',
                issue: 'Low frame rate',
                suggestion: 'Consider reducing star count with filters, disabling bloom effects, or reducing visual quality'
            });
        }

        // Worker utilization recommendations
        const workerUsage = this.metrics.pathfinding.totalCalculations > 0 
            ? this.metrics.pathfinding.workerCalculations / this.metrics.pathfinding.totalCalculations
            : 0;

        if (workerUsage < 0.5 && this.metrics.pathfinding.totalCalculations > 5) {
            recommendations.push({
                category: 'optimization',
                priority: 'medium',
                issue: 'Low Web Worker utilization',
                suggestion: 'Web Worker may not be available or functioning properly. Check browser compatibility.'
            });
        }

        // Memory recommendations
        const latestMemory = this.metrics.memory.samples[this.metrics.memory.samples.length - 1];
        if (latestMemory && latestMemory.usage > 80) {
            recommendations.push({
                category: 'memory',
                priority: 'high',
                issue: 'High memory usage',
                suggestion: 'Consider reducing loaded star data or clearing route visualizations'
            });
        }

        return recommendations;
    }

    // Benchmark utilities
    async measureAsyncOperation(operation, description = 'Operation') {
        const startTime = performance.now();
        
        try {
            const result = await operation();
            const duration = performance.now() - startTime;
            
            console.log(`${description} completed in ${duration.toFixed(2)}ms`);
            return { result, duration, success: true };
        } catch (error) {
            const duration = performance.now() - startTime;
            console.warn(`${description} failed after ${duration.toFixed(2)}ms:`, error);
            return { error, duration, success: false };
        }
    }

    measureSyncOperation(operation, description = 'Operation') {
        const startTime = performance.now();
        
        try {
            const result = operation();
            const duration = performance.now() - startTime;
            
            console.log(`${description} completed in ${duration.toFixed(2)}ms`);
            return { result, duration, success: true };
        } catch (error) {
            const duration = performance.now() - startTime;
            console.warn(`${description} failed after ${duration.toFixed(2)}ms:`, error);
            return { error, duration, success: false };
        }
    }

    // Export performance data for analysis
    exportMetrics() {
        const report = this.getPerformanceReport();
        const exportData = {
            timestamp: new Date().toISOString(),
            report,
            rawMetrics: this.metrics
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `star-map-performance-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        return exportData;
    }

    // Reset all metrics
    reset() {
        this.metrics = {
            frameRate: { samples: [], maxSamples: 120, average: 0, min: Infinity, max: 0 },
            renderTime: { samples: [], maxSamples: 60, average: 0 },
            pathfinding: { 
                totalCalculations: 0, totalTime: 0, averageTime: 0, longestCalculation: 0,
                workerCalculations: 0, fallbackCalculations: 0 
            },
            filtering: { totalFilters: 0, totalTime: 0, averageTime: 0, lastFilterTime: 0 },
            memory: { samples: [], maxSamples: 30, lastUpdate: 0 }
        };
        
        this.startTime = performance.now();
        console.log('Performance metrics reset');
    }
}

// Global performance monitor instance
export const globalPerformanceMonitor = new PerformanceMonitor();

// Utility decorators for automatic performance measurement
export function measurePerformance(description) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function(...args) {
            const startTime = performance.now();
            
            try {
                const result = originalMethod.apply(this, args);
                
                if (result && typeof result.then === 'function') {
                    // Async function
                    return result.finally(() => {
                        const duration = performance.now() - startTime;
                        console.log(`${description || propertyKey} completed in ${duration.toFixed(2)}ms`);
                    });
                } else {
                    // Sync function
                    const duration = performance.now() - startTime;
                    console.log(`${description || propertyKey} completed in ${duration.toFixed(2)}ms`);
                    return result;
                }
            } catch (error) {
                const duration = performance.now() - startTime;
                console.warn(`${description || propertyKey} failed after ${duration.toFixed(2)}ms:`, error);
                throw error;
            }
        };

        return descriptor;
    };
}