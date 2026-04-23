"""Rebuild gen.py: extract function header + data, write clean file with correct counts."""
import re

src = open('C:/Users/mglenn/.dotfiles/pi/prompt-routing/data/synthetic_shards/genD/gen.py').read()
lines = src.splitlines(keepends=True)

# Extract function header (lines before opus_high = [)
fn_header = []
for l in lines:
    if l.strip() == 'opus_high = [':
        break
    fn_header.append(l)

def extract_list(lines, list_name):
    """Extract all tuple 2-line entries from the first occurrence of list_name = [...]."""
    inside = False
    tuples = []
    i = 0
    while i < len(lines):
        l = lines[i]
        if not inside:
            if l.strip() == f'{list_name} = [':
                inside = True
        else:
            if l.strip().startswith("('"):
                # grab this line and next (the domain/type/etc line)
                t_line = l.rstrip('\n')
                d_line = lines[i+1].rstrip('\n') if i+1 < len(lines) else ''
                tuples.append((t_line, d_line))
                i += 2
                continue
            elif l.strip() == ']':
                break  # first closing bracket = end of list
        i += 1
    return tuples

oh_tuples = extract_list(lines, 'opus_high')
om_tuples = extract_list(lines, 'opus_medium')
sh_tuples = extract_list(lines, 'sonnet_high')

print(f'Extracted: opus_high={len(oh_tuples)}, opus_medium={len(om_tuples)}, sonnet_high={len(sh_tuples)}')

# Extra 74 tuples for opus_high (to reach 300)
extra_oh = [
    ("    ('Prove that this wait-free FIFO queue implemented with a linked list is correct under the C++20 memory model. Identify the exact fence placement for the enqueue linearization point.',",
     "     'concurrency', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this kernel page table walker for the race between a TLB shootdown and a concurrent page fault that unmaps the faulting page. Prove your fix prevents the use-after-free.',",
     "     'kernel', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a conflict serializable transaction scheduler using timestamp ordering. Prove that the Thomas write rule extension is safe and identify when it must be disabled.',",
     "     'database_internals', 'design', 'ambiguous', 'high'),"),
    ("    ('Prove that this splay tree achieves O(log n) amortized cost per operation using the access lemma. Construct the worst-case sequence and show the potential drop compensates.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this eBPF map update path for the TOCTOU race when a map entry is deleted between a bpf_map_lookup_elem and the subsequent write. Propose the atomic-update alternative.',",
     "     'kernel', 'code_debug', 'ambiguous', 'high'),"),
    ("    ('Design a formally verified packet filter in Coq that rejects all packets matching a given CIDR block. Prove the filter is complete and sound with respect to the IP address predicate.',",
     "     'formal_methods', 'design', 'ambiguous', 'high'),"),
    ("    ('Analyze this AES-CTR implementation for nonce reuse under multi-threaded encryption. Identify the atomic counter increment that is missing and quantify the keystream overlap probability.',",
     "     'cryptography', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Prove that this parallel merge sort is work-optimal: its total work is O(n log n) and its span is O(log^2 n). Identify the recurrence and solve it using the master theorem.',",
     "     'algorithms', 'analysis', 'clear', 'high'),"),
    ("    ('Analyze this kernel io_uring submission queue for the case where the producer and consumer share a single head pointer without a memory barrier. Identify the lost submission.',",
     "     'kernel', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a sound type system for a language with first-class continuations. Prove that well-typed programs cannot cause a control-flow escape that corrupts the call stack.',",
     "     'compilers', 'design', 'ambiguous', 'high'),"),
    ("    ('Given this implementation of a Bloom filter with k hash functions, derive the false positive rate as a function of n insertions and prove the optimal k minimizes it.',",
     "     'algorithms', 'analysis', 'clear', 'high'),"),
    ("    ('Analyze this distributed snapshot isolation implementation for the predicate read anomaly under concurrent insert and read transactions. Construct the minimal violating schedule.',",
     "     'database_internals', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Prove that this authenticated encryption scheme is secure against chosen-ciphertext attacks. Show the reduction from IND-CCA2 to the underlying block cipher PRF assumption.',",
     "     'cryptography', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a GC compaction algorithm that moves objects while allowing concurrent reads. Prove that no read returns a stale pointer to the pre-compaction address.',",
     "     'gc', 'design', 'ambiguous', 'high'),"),
    ("    ('Analyze this NUMA memory allocator for the false sharing pattern that causes cache line ping-pong between sockets. Identify the padding fix and derive the cache line size requirement.',",
     "     'performance_deep', 'analysis', 'borderline', 'high'),"),
    ("    ('Prove that this Byzantine agreement protocol reaches consensus in O(n^2) message complexity. Show that the lower bound of O(n^2) is tight by an adversary argument.',",
     "     'consensus', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Given this lock-free linked list, identify the memory ordering violation that allows a reader to observe a node that has been logically deleted but not yet physically unlinked.',",
     "     'concurrency', 'code_debug', 'ambiguous', 'high'),"),
    ("    ('Design an optimal binary decision diagram for a given boolean formula. Prove that the variable ordering you choose minimizes the number of nodes in the reduced OBDD.',",
     "     'algorithms', 'design', 'ambiguous', 'high'),"),
    ("    ('Analyze this kernel futex implementation for the case where a thread is migrated to a different CPU between the user-space load and the futex_wait syscall. Prove no lost wakeup occurs.',",
     "     'kernel', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Prove that this network flow algorithm correctly computes the maximum flow in a graph with integer capacities. Show that the augmenting path terminates in O(VE) iterations.',",
     "     'algorithms', 'analysis', 'clear', 'high'),"),
    ("    ('Analyze this JIT compiler for the deoptimization storm that occurs when a polymorphic call site invalidates an inlined assumption. Derive the threshold that prevents repeated deopt.',",
     "     'compilers', 'analysis', 'borderline', 'high'),"),
    ("    ('Given this implementation of the Lamport bakery algorithm for N threads, prove mutual exclusion and starvation freedom under the given fairness assumption.',",
     "     'concurrency', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a verifiable secret sharing scheme where any t of n parties can reconstruct the secret but t-1 cannot. Prove information-theoretic security of the (t,n)-threshold scheme.',",
     "     'cryptography', 'design', 'ambiguous', 'high'),"),
    ("    ('Analyze this distributed workflow engine for the state machine violation that occurs when two workers concurrently pick up the same task. Prove your optimistic lock fix is correct.',",
     "     'distributed_systems', 'code_debug', 'ambiguous', 'high'),"),
    ("    ('Prove that this randomized load balancing policy achieves expected O(log log n) maximum load when n balls are thrown into n bins. Identify the two-choice argument.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this ARM pointer authentication implementation for the case where a forged PAC can be crafted from a known signature under a related-key model. Derive the attack bound.',",
     "     'security_threat_modeling', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a concurrent B+ tree that supports range scans without holding any latch during the full scan. Prove that the scan observes a consistent snapshot.',",
     "     'database_internals', 'design', 'ambiguous', 'high'),"),
    ("    ('Prove that this amortized heap achieves O(1) insert and O(log n) extract-min. Show the potential function and verify the amortized cost of each operation independently.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this kernel signal delivery path for the race where a signal is sent to a thread that is concurrently exiting. Prove the signal handler is never called on freed stack memory.',",
     "     'kernel', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a memory-efficient suffix automaton for online pattern matching. Prove the number of states is bounded by 2n-1 and the number of transitions is bounded by 3n-4.',",
     "     'algorithms', 'design', 'ambiguous', 'high'),"),
    ("    ('Analyze this distributed rate limiter based on token bucket with gossip-based synchronization. Prove that the aggregate burst never exceeds the configured limit by more than O(n) tokens.',",
     "     'distributed_systems', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Prove that this GC finalization ordering is correct: an object s finalizer runs before any finalizer of objects reachable only through it. Show the topological traversal argument.',",
     "     'gc', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this x86 hyperthreading microarchitecture for the L1 cache side-channel that allows one hardware thread to measure another s memory access pattern. Quantify the bandwidth.',",
     "     'security_threat_modeling', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a packet loss recovery scheme for a real-time audio codec that achieves acceptable quality at 10% loss without retransmission. Prove the FEC overhead is bounded.',",
     "     'networking_deep', 'design', 'borderline', 'high'),"),
    ("    ('Prove that this concurrent union-find structure with path compression achieves O(alpha(n)) amortized cost per operation where alpha is the inverse Ackermann function.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this lock-free memory pool for the case where a freed block is immediately reallocated before the freeing thread has exited its critical section. Identify the use-after-free.',",
     "     'concurrency', 'code_debug', 'ambiguous', 'high'),"),
    ("    ('Design a verified compiler pass that transforms tail calls into jumps. Prove the transformation preserves the operational semantics including stack depth invariants.',",
     "     'compilers', 'design', 'ambiguous', 'high'),"),
    ("    ('Given this implementation of consistent hashing with virtual nodes, prove that adding a node causes at most 1/n of the keys to migrate on average. Derive the variance.',",
     "     'distributed_systems', 'analysis', 'borderline', 'high'),"),
    ("    ('Analyze this kernel memory pressure notifier for the race where the notifier fires while a process is allocating memory from the same zone it is trying to reclaim.',",
     "     'kernel', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Prove that this persistent segment tree achieves O(log n) time and space per update while preserving full version history. Show the node sharing invariant.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this time-series compaction algorithm for the correctness violation that occurs when two overlapping time ranges are merged with different retention policies.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Design a hardware-assisted CFI scheme that prevents return-oriented programming without compiler instrumentation. Prove it covers all gadget classes in the given threat model.',",
     "     'security_threat_modeling', 'design', 'ambiguous', 'high'),"),
    ("    ('Prove that this parallel BFS using work-stealing terminates in O(D + V/P) time where D is diameter and P is processor count. Identify the stealing threshold.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this connection multiplexing library for the head-of-line blocking that occurs when a slow response on one stream delays a fast response on a sibling stream.',",
     "     'networking_deep', 'analysis', 'borderline', 'high'),"),
    ("    ('Design a transactional file system that provides ACID semantics over POSIX operations. Prove that a crash between write and fsync never leaves the file in a partially written state.',",
     "     'kernel', 'design', 'ambiguous', 'high'),"),
    ("    ('Prove that this Hindley-Milner type inference algorithm produces the most general type for every well-typed expression. Show the unification is idempotent and confluent.',",
     "     'compilers', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this distributed counter using CRDT G-counters for the case where a merge races with a local increment. Prove monotonicity is preserved.',",
     "     'distributed_systems', 'analysis', 'borderline', 'high'),"),
    ("    ('Given this implementation of skip list with probabilistic balancing, prove the expected search time is O(log n) and derive the constant factor for the chosen promotion probability.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this GC write barrier for the case where a pointer is written during a concurrent relocation. Prove the barrier catches the store and updates the forwarding pointer correctly.',",
     "     'gc', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a hardware memory transaction implementation that falls back to a software handler on conflict. Prove the fallback path is always safe and never causes a livelock.',",
     "     'concurrency', 'design', 'ambiguous', 'high'),"),
    ("    ('Prove that this authenticated key exchange protocol achieves forward secrecy. Show that compromise of the long-term key does not reveal past session keys.',",
     "     'cryptography', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this database sort-merge join for the external-memory complexity. Derive the number of I/O passes as a function of the buffer pool size and the input relation sizes.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Given this kernel interrupt handler that masks interrupts and accesses a shared data structure, identify the priority inversion that occurs on a PREEMPT_RT kernel and propose a fix.',",
     "     'kernel', 'code_debug', 'ambiguous', 'high'),"),
    ("    ('Prove that this weighted round-robin scheduler achieves proportional share: a process with weight w receives exactly w/(sum of weights) of CPU time over any sufficiently long interval.',",
     "     'scheduling', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this inline cache implementation in a JIT for the megamorphic case where more than 4 types are seen at the same call site. Identify the deoptimization trigger and its cost.',",
     "     'compilers', 'analysis', 'borderline', 'high'),"),
    ("    ('Design a distributed ledger commit protocol that achieves finality within 2 seconds under 50ms network latency. Prove no fork occurs when up to f < n/3 nodes are Byzantine.',",
     "     'consensus', 'design', 'ambiguous', 'high'),"),
    ("    ('Prove that this copy-on-write B-tree implementation never modifies a shared node. Show the path copying invariant holds even under concurrent readers during a write.',",
     "     'database_internals', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this futex-based condition variable implementation for the spurious wakeup that occurs when the waiter is signaled between the predicate check and the futex_wait call.',",
     "     'concurrency', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a zero-copy scatter-gather DMA engine interface that prevents a device from accessing host memory beyond the registered buffer range. Prove IOMMU enforcement is sufficient.',",
     "     'kernel', 'design', 'ambiguous', 'high'),"),
    ("    ('Prove that this string hashing algorithm is universal: for any two distinct strings, the probability of collision under a random seed is at most 1/m where m is the table size.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this memory-mapped file implementation for the SIGBUS that occurs when a file is truncated while a page fault is pending for the truncated region. Propose the fix.',",
     "     'kernel', 'code_debug', 'ambiguous', 'high'),"),
    ("    ('Design a sound effect system for Rust unsafe code that tracks the set of memory locations a function may alias. Prove the effect system prevents all data races.',",
     "     'formal_methods', 'design', 'ambiguous', 'high'),"),
    ("    ('Prove that this probabilistic data structure for cardinality estimation achieves the stated relative error bound with the given number of hash functions and register bits.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this distributed deadlock detector for false positives when a transaction waits on a resource held by a transaction on a different node. Prove the graph reduction is sound.',",
     "     'distributed_systems', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Given this generational garbage collector, prove that a minor GC never misses a live object because the remembered set correctly records all old-to-young pointers.',",
     "     'gc', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a formally proven monotone data flow analysis framework. Prove that the fixed point computation terminates and the result is the least fixed point.',",
     "     'compilers', 'design', 'ambiguous', 'high'),"),
    ("    ('Analyze this packet reordering buffer in a network driver for the memory exhaustion attack where an adversary sends out-of-order packets to fill the buffer. Propose a bounded fix.',",
     "     'networking_deep', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Prove that this oblivious RAM protocol hides the access pattern from an observer. Show that the shuffle and dummy access scheme is statistically indistinguishable from uniform access.',",
     "     'cryptography', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this kernel workqueue thread pool for the ordering violation that occurs when a high-priority work item is submitted but processed after a low-priority item already queued.',",
     "     'kernel', 'analysis', 'borderline', 'high'),"),
    ("    ('Design an optimal cache replacement policy for a workload where the future access pattern is partially known. Prove its hit rate is no worse than OPT by a factor of 2.',",
     "     'algorithms', 'design', 'borderline', 'high'),"),
    ("    ('Prove that this vector clock compression algorithm preserves the partial order: two events are ordered in the compressed representation if and only if they are ordered in the original.',",
     "     'distributed_systems', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Analyze this concurrent log-structured storage engine for the case where a flush and a compaction race on the same SSTable. Prove the manifest update protocol prevents data loss.',",
     "     'database_internals', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Given this JVM safepoint implementation, identify the scenario where a thread spinning in a tight native loop never reaches a safepoint, causing the GC to stall indefinitely.',",
     "     'gc', 'analysis', 'ambiguous', 'high'),"),
    ("    ('Design a constant-time comparison function for cryptographic secrets. Prove that no branching on secret data occurs and that the function compiles to constant-time machine code on x86.',",
     "     'cryptography', 'design', 'clear', 'high'),"),
    ("    ('Prove that this bin packing approximation algorithm achieves a 1.5 approximation ratio. Construct the tight example and show the analysis is not improvable without additional structure.',",
     "     'algorithms', 'analysis', 'ambiguous', 'high'),"),
]

assert len(extra_oh) == 75, f"extra_oh has {len(extra_oh)}"

# Extra 45 opus_medium rows
extra_om = [
    ("    ('Analyze this Apache Kafka Streams topology for the state store rebalancing issue that causes a 30-second processing gap when a new consumer joins the group.',",
     "     'distributed_systems', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this OpenTelemetry span propagation that loses the trace context when crossing a ThreadPoolExecutor boundary in Python. Identify the context variable missing propagation.',",
     "     'concurrency', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a multi-level cache hierarchy for a product catalog API serving 1M requests/minute. Identify the consistency window between L1 and L2 and propose the invalidation strategy.',",
     "     'performance_deep', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this Elasticsearch bulk indexing configuration for the rejected execution exception that occurs when the bulk thread pool queue is exhausted under a burst. Propose the fix.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this gRPC interceptor chain for the case where a panic in one interceptor causes the connection to be closed without sending a proper status code to the client.',",
     "     'networking_deep', 'code_review', 'borderline', 'high'),"),
    ("    ('Analyze this Kubernetes custom resource controller for the reconciliation loop that runs indefinitely when the object status update itself triggers a watch event.',",
     "     'distributed_systems', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this Java ScheduledThreadPoolExecutor that stops scheduling tasks after an uncaught exception in one of the scheduled runnables. Identify the suppressed-exception fix.',",
     "     'concurrency', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a distributed ID generation scheme for a multi-region database that produces monotonically increasing IDs without a central coordinator. Analyze the ordering guarantee.',",
     "     'distributed_systems', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this PostgreSQL partitioning setup for the constraint exclusion failure that causes the planner to scan all partitions instead of the single matching partition.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this HAProxy configuration for the case where a backend server becomes healthy while 2000 connections are queued to other servers and are not redistributed.',",
     "     'networking_deep', 'code_review', 'borderline', 'high'),"),
    ("    ('Analyze this Java CompletableFuture chain for the thread pool starvation that occurs when all pool threads are blocked waiting for futures that require the same pool to complete.',",
     "     'concurrency', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this Consul service mesh health check that flaps when the check interval is shorter than the time required to start a new pod replica after a rolling deploy.',",
     "     'distributed_systems', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a log aggregation pipeline that handles 10GB/hour of structured logs with sub-second search latency. Identify the indexing strategy and retention tier boundaries.',",
     "     'performance_deep', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this MySQL InnoDB deadlock for the gap lock contention that occurs when two transactions insert rows with adjacent primary keys within the same gap lock range.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this Rust async task spawner for the case where a task panics and the panic is silently swallowed by the executor. Identify the JoinHandle::await fix.',",
     "     'concurrency', 'code_review', 'borderline', 'high'),"),
    ("    ('Analyze this Vault dynamic secrets lease renewal for the case where a service token expires between lease renewal attempts due to a network partition. Propose the retry fix.',",
     "     'security_threat_modeling', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this Apache Spark job that exhibits data skew causing 3 tasks to take 10x longer than the rest. Identify the key distribution and propose the salting approach.',",
     "     'performance_deep', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a cross-datacenter replication topology for a time-series database with write-heavy workloads. Identify the conflict-free merge strategy for concurrent writes.',",
     "     'database_internals', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this Nginx rate limiting configuration for the case where rate limits are applied per server block rather than per upstream IP, allowing IP rotation to bypass limits.',",
     "     'security_threat_modeling', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this Python threading.Event usage for the case where event.wait() returns True but the condition it guards has been reset by another thread before the waiter proceeds.',",
     "     'concurrency', 'code_review', 'borderline', 'high'),"),
    ("    ('Analyze this service-to-service authentication using mTLS for the case where certificate revocation is not checked, allowing a compromised service certificate to remain valid.',",
     "     'security_threat_modeling', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this RabbitMQ consumer that stops acknowledging messages after a channel-level exception, causing the queue to grow unboundedly. Identify the channel recovery fix.',",
     "     'distributed_systems', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a multi-tier caching strategy for a recommendation engine that serves personalized content with sub-50ms latency to 10M daily active users.',",
     "     'performance_deep', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this PostgreSQL autovacuum configuration for the transaction ID wraparound risk that occurs when autovacuum cannot keep up with the insertion rate. Propose the fix.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this OAuth token introspection endpoint for the missing cache that causes N token validations per second to hit the authorization server. Propose the TTL-based cache.',",
     "     'security_threat_modeling', 'code_review', 'borderline', 'high'),"),
    ("    ('Analyze this Go channel-based worker pool for the goroutine leak that occurs when the context is cancelled but workers are blocked on a full result channel.',",
     "     'concurrency', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this Kubernetes ingress controller that drops 0.1% of requests during a pod rolling update. Identify the readiness probe timing gap and propose the minReadySeconds fix.',",
     "     'networking_deep', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a zero-downtime database failover procedure for a primary/replica PostgreSQL setup. Identify the replication lag check and the application reconnection strategy.',",
     "     'database_internals', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this AWS Lambda function for the cold start latency spike that occurs when VPC-attached functions scale from 0 to 100 concurrent invocations within 1 second.',",
     "     'performance_deep', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this Apache Kafka consumer offset commit strategy for the case where auto-commit fires while a message is being processed, causing that message to be lost on restart.',",
     "     'distributed_systems', 'code_review', 'borderline', 'high'),"),
    ("    ('Analyze this mutual TLS termination at the API gateway for the case where the backend service trusts any certificate signed by the CA, not just the gateway certificate.',",
     "     'security_threat_modeling', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this Celery chord that hangs indefinitely when one of the chord tasks raises an exception without propagating it. Identify the missing link error callback.',",
     "     'concurrency', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a distributed lock manager for a cluster of 10 nodes using lease-based locking. Identify the maximum safe lease duration given 100ms clock drift.',",
     "     'distributed_systems', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this SQL window function query for the performance regression that occurs when the PARTITION BY column has high cardinality and no supporting index.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this Python requests session for the connection pool exhaustion that occurs when responses are not consumed, leaving sockets open until the pool times out.',",
     "     'networking_deep', 'code_review', 'borderline', 'high'),"),
    ("    ('Analyze this AWS S3 presigned URL implementation for the SSRF vulnerability that allows the URL to be redirected to an internal metadata endpoint.',",
     "     'security_threat_modeling', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this Node.js event loop starvation caused by a synchronous crypto operation that blocks the loop for 200ms. Identify the worker thread migration fix.',",
     "     'performance_deep', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a multi-datacenter active-passive failover for a stateful streaming pipeline. Identify the checkpoint synchronization requirement and the maximum failover time.',",
     "     'distributed_systems', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this DynamoDB hot partition caused by a monotonically increasing sort key. Identify the write sharding strategy and derive the shard count from the write capacity units.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this JWT refresh token rotation implementation for the race condition where two concurrent refresh requests both succeed, invalidating the other session.',",
     "     'security_threat_modeling', 'code_review', 'borderline', 'high'),"),
    ("    ('Analyze this asyncio event loop for the callback starvation that occurs when a long-running coroutine does not yield, preventing I/O callbacks from being processed.',",
     "     'concurrency', 'analysis', 'borderline', 'high'),"),
    ("    ('Debug this Kubernetes HPA that oscillates between 2 and 10 pods every 5 minutes due to a metric that spikes during scale-up. Identify the stabilization window fix.',",
     "     'scheduling', 'code_debug', 'borderline', 'high'),"),
    ("    ('Design a content moderation pipeline that processes user uploads at 10K items/minute with a 500ms latency budget. Identify the async fan-out and result aggregation strategy.',",
     "     'distributed_systems', 'design', 'borderline', 'high'),"),
    ("    ('Analyze this Redis Cluster resharding operation for the key migration window where a key is temporarily inaccessible during the MIGRATE command. Propose the retry fix.',",
     "     'database_internals', 'analysis', 'borderline', 'high'),"),
    ("    ('Review this Kafka topic ACL configuration for the wildcard permission that allows any consumer group to read from any topic in the cluster. Propose the least-privilege fix.',",
     "     'security_threat_modeling', 'code_review', 'borderline', 'high'),"),
]

assert len(extra_om) == 45, f"extra_om has {len(extra_om)}"

# Build new file
def tuples_to_lines(tuples):
    lines = []
    for (l1, l2) in tuples:
        lines.append(l1 + '\n')
        lines.append(l2 + '\n')
    return lines

out = []
out.extend(fn_header)
out.append('opus_high = [\n')
out.extend(tuples_to_lines(oh_tuples[:226]))
out.extend(tuples_to_lines(extra_oh[:74]))
out.append(']\n\n')
out.append('opus_medium = [\n')
out.extend(tuples_to_lines(om_tuples[:105]))
out.extend(tuples_to_lines(extra_om))
out.append(']\n\n')
out.append('sonnet_high = [\n')
out.extend(tuples_to_lines(sh_tuples[:50]))
out.append(']\n\n')
out.append("assert len(opus_high) == 300, f'opus_high has {len(opus_high)} rows'\n")
out.append("assert len(opus_medium) == 150, f'opus_medium has {len(opus_medium)} rows'\n")
out.append("assert len(sonnet_high) == 50, f'sonnet_high has {len(sonnet_high)} rows'\n")
out.append('\n')
out.append("out_path = 'C:/Users/mglenn/.dotfiles/pi/prompt-routing/data/synthetic_shards/genD/chunk.jsonl'\n")
out.append('total = 0\n')
out.append('with open(out_path, \'w\', encoding=\'utf-8\') as f:\n')
out.append('    for i, (prompt, domain, task_type, ambiguity, complexity_tier) in enumerate(opus_high):\n')
out.append('        f.write(row(f\'GD-OH-{i:04d}\', f\'GD-F-OH-{i:04d}\', prompt, domain, task_type, ambiguity, \'Opus\', \'high\', complexity_tier) + \'\\n\')\n')
out.append('        total += 1\n')
out.append('    for i, (prompt, domain, task_type, ambiguity, complexity_tier) in enumerate(opus_medium):\n')
out.append('        f.write(row(f\'GD-OM-{i:04d}\', f\'GD-F-OM-{i:04d}\', prompt, domain, task_type, ambiguity, \'Opus\', \'medium\', complexity_tier) + \'\\n\')\n')
out.append('        total += 1\n')
out.append('    for i, (prompt, domain, task_type, ambiguity, complexity_tier) in enumerate(sonnet_high):\n')
out.append('        f.write(row(f\'GD-SH-{i:04d}\', f\'GD-F-SH-{i:04d}\', prompt, domain, task_type, ambiguity, \'Sonnet\', \'high\', complexity_tier) + \'\\n\')\n')
out.append('        total += 1\n')
out.append('\n')
out.append("print(f'Written: {total} rows')\n")
out.append("print(f'opus_high: {len(opus_high)}, opus_medium: {len(opus_medium)}, sonnet_high: {len(sonnet_high)}')\n")

with open('C:/Users/mglenn/.dotfiles/pi/prompt-routing/data/synthetic_shards/genD/gen.py', 'w', encoding='utf-8') as f:
    f.writelines(out)

print('gen.py written. Verifying...')
import subprocess
r = subprocess.run(['python', 'C:/Users/mglenn/.dotfiles/pi/prompt-routing/data/synthetic_shards/genD/gen.py'],
                   capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print('ERRORS:', r.stderr[-500:])
