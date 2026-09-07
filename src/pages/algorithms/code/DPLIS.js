// Longest Increasing Subsequence — O(n^2) DP + O(n log n) patience sort.

export const CODE = {
  dp: {
    pseudo: `lis_dp(a):
  n = |a|
  dp[0..n-1] = 1
  for i = 1 .. n-1:
    for j = 0 .. i-1:
      if a[j] < a[i] and dp[j] + 1 > dp[i]:
        dp[i] = dp[j] + 1
  return max(dp)`,

    c: `int lis_dp(const int a[], int n) {
    if (n == 0) return 0;
    int dp[1024]; /* callers can heap-alloc for large n */
    for (int i = 0; i < n; i++) dp[i] = 1;
    int best = 1;
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (a[j] < a[i] && dp[j] + 1 > dp[i]) dp[i] = dp[j] + 1;
        }
        if (dp[i] > best) best = dp[i];
    }
    return best;
}`,

    cpp: `#include <vector>
#include <algorithm>

int lis_dp(const std::vector<int>& a) {
    int n = (int)a.size();
    if (n == 0) return 0;
    std::vector<int> dp(n, 1);
    for (int i = 1; i < n; ++i) {
        for (int j = 0; j < i; ++j) {
            if (a[j] < a[i] && dp[j] + 1 > dp[i]) dp[i] = dp[j] + 1;
        }
    }
    return *std::max_element(dp.begin(), dp.end());
}`,

    python: `def lis_dp(a):
    # dp[i] = length of LIS ending at index i.
    n = len(a)
    if n == 0:
        return 0
    dp = [1] * n
    for i in range(1, n):
        for j in range(i):
            if a[j] < a[i] and dp[j] + 1 > dp[i]:
                dp[i] = dp[j] + 1
    return max(dp)`,

    java: `public static int lisDp(int[] a) {
    int n = a.length;
    if (n == 0) return 0;
    int[] dp = new int[n];
    java.util.Arrays.fill(dp, 1);
    int best = 1;
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (a[j] < a[i] && dp[j] + 1 > dp[i]) dp[i] = dp[j] + 1;
        }
        best = Math.max(best, dp[i]);
    }
    return best;
}`,

    rust: `pub fn lis_dp(a: &[i32]) -> usize {
    let n = a.len();
    if n == 0 { return 0; }
    // dp[i] = length of the LIS that ends at index i.
    let mut dp = vec![1usize; n];
    for i in 1..n {
        for j in 0..i {
            if a[j] < a[i] && dp[j] + 1 > dp[i] {
                dp[i] = dp[j] + 1;
            }
        }
    }
    *dp.iter().max().unwrap()
}`,
  },

  patience: {
    pseudo: `lis_patience(a):
  tails = []   # tails[k] = smallest tail of any LIS of length k+1
  for x in a:
    pos = lower_bound(tails, x)
    if pos == |tails|:
      tails.push(x)
    else:
      tails[pos] = x
  return |tails|`,

    c: `#include <stdlib.h>

/* Binary search for the first index i where tails[i] >= x. */
static int lb(int* tails, int n, int x) {
    int lo = 0, hi = n;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (tails[mid] < x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

int lis_patience(const int a[], int n) {
    int* tails = (int*)malloc(n * sizeof(int));
    int k = 0;
    for (int i = 0; i < n; i++) {
        int p = lb(tails, k, a[i]);
        tails[p] = a[i];
        if (p == k) k++;
    }
    free(tails);
    return k;
}`,

    cpp: `#include <vector>
#include <algorithm>

int lis_patience(const std::vector<int>& a) {
    std::vector<int> tails; // tails[k] = smallest tail among LIS of length k+1
    for (int x : a) {
        auto it = std::lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) tails.push_back(x);
        else                   *it = x;
    }
    return (int)tails.size();
}`,

    python: `from bisect import bisect_left

def lis_patience(a):
    """Patience-sort LIS in O(n log n)."""
    tails = []
    for x in a:
        # tails[] holds the smallest possible tail for each achievable length.
        pos = bisect_left(tails, x)
        if pos == len(tails):
            tails.append(x)
        else:
            tails[pos] = x
    return len(tails)`,

    java: `import java.util.*;

public static int lisPatience(int[] a) {
    List<Integer> tails = new ArrayList<>();
    for (int x : a) {
        // First index with tail >= x — Collections.binarySearch returns -(pos)-1 on miss.
        int lo = 0, hi = tails.size();
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (tails.get(mid) < x) lo = mid + 1;
            else                     hi = mid;
        }
        if (lo == tails.size()) tails.add(x);
        else                    tails.set(lo, x);
    }
    return tails.size();
}`,

    rust: `pub fn lis_patience(a: &[i32]) -> usize {
    let mut tails: Vec<i32> = Vec::new();
    for &x in a {
        // partition_point = first index where predicate is false.
        let p = tails.partition_point(|&t| t < x);
        if p == tails.len() { tails.push(x); }
        else                 { tails[p] = x; }
    }
    tails.len()
}`,
  },
}
