// Longest Increasing Subsequence — O(n^2) DP + O(n log n) patience sort.
// Both variants are runnable end-to-end.
const SAMPLE = "[10, 9, 2, 5, 3, 7, 101, 18]  // expected LIS length 4 (e.g. 2,3,7,101)";

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

    c: `#include <stdio.h>

int lis_dp(const int a[], int n) {
    if (n == 0) return 0;
    int dp[1024];
    for (int i = 0; i < n; i++) dp[i] = 1;
    int best = 1;
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (a[j] < a[i] && dp[j] + 1 > dp[i]) dp[i] = dp[j] + 1;
        }
        if (dp[i] > best) best = dp[i];
    }
    return best;
}

int main(void) {
    int a[] = {10, 9, 2, 5, 3, 7, 101, 18};
    int n = 8;
    printf("LIS(dp) length = %d\\n", lis_dp(a, n));
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
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
}

int main() {
    std::vector<int> a = {10, 9, 2, 5, 3, 7, 101, 18};
    std::cout << "LIS(dp) length = " << lis_dp(a) << "\\n";
    return 0;
}`,

    python: `def lis_dp(a):
    n = len(a)
    if n == 0: return 0
    dp = [1] * n
    for i in range(1, n):
        for j in range(i):
            if a[j] < a[i] and dp[j] + 1 > dp[i]:
                dp[i] = dp[j] + 1
    return max(dp)

if __name__ == "__main__":
    a = [10, 9, 2, 5, 3, 7, 101, 18]
    print("LIS(dp) length =", lis_dp(a))`,

    java: `public class Main {
    public static int lisDp(int[] a) {
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
    }
    public static void main(String[] args) {
        int[] a = {10, 9, 2, 5, 3, 7, 101, 18};
        System.out.println("LIS(dp) length = " + lisDp(a));
    }
}`,

    rust: `fn lis_dp(a: &[i32]) -> usize {
    let n = a.len();
    if n == 0 { return 0; }
    let mut dp = vec![1usize; n];
    for i in 1..n {
        for j in 0..i {
            if a[j] < a[i] && dp[j] + 1 > dp[i] {
                dp[i] = dp[j] + 1;
            }
        }
    }
    *dp.iter().max().unwrap()
}

fn main() {
    let a = [10, 9, 2, 5, 3, 7, 101, 18];
    println!("LIS(dp) length = {}", lis_dp(&a));
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

    c: `#include <stdio.h>
#include <stdlib.h>

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
    int* tails = malloc(n * sizeof(int));
    int k = 0;
    for (int i = 0; i < n; i++) {
        int p = lb(tails, k, a[i]);
        tails[p] = a[i];
        if (p == k) k++;
    }
    free(tails);
    return k;
}

int main(void) {
    int a[] = {10, 9, 2, 5, 3, 7, 101, 18};
    printf("LIS(patience) length = %d\\n", lis_patience(a, 8));
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <algorithm>

int lis_patience(const std::vector<int>& a) {
    std::vector<int> tails;
    for (int x : a) {
        auto it = std::lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) tails.push_back(x);
        else                   *it = x;
    }
    return (int)tails.size();
}

int main() {
    std::vector<int> a = {10, 9, 2, 5, 3, 7, 101, 18};
    std::cout << "LIS(patience) length = " << lis_patience(a) << "\\n";
    return 0;
}`,

    python: `from bisect import bisect_left

def lis_patience(a):
    tails = []
    for x in a:
        pos = bisect_left(tails, x)
        if pos == len(tails): tails.append(x)
        else:                 tails[pos] = x
    return len(tails)

if __name__ == "__main__":
    a = [10, 9, 2, 5, 3, 7, 101, 18]
    print("LIS(patience) length =", lis_patience(a))`,

    java: `import java.util.*;

public class Main {
    public static int lisPatience(int[] a) {
        List<Integer> tails = new ArrayList<>();
        for (int x : a) {
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
    }
    public static void main(String[] args) {
        int[] a = {10, 9, 2, 5, 3, 7, 101, 18};
        System.out.println("LIS(patience) length = " + lisPatience(a));
    }
}`,

    rust: `fn lis_patience(a: &[i32]) -> usize {
    let mut tails: Vec<i32> = Vec::new();
    for &x in a {
        let p = tails.partition_point(|&t| t < x);
        if p == tails.len() { tails.push(x); }
        else                { tails[p] = x; }
    }
    tails.len()
}

fn main() {
    let a = [10, 9, 2, 5, 3, 7, 101, 18];
    println!("LIS(patience) length = {}", lis_patience(&a));
}`,
  },
}

export const LIS_DP_SAMPLES = [
  { name: 'Classic',      description: 'a = [10,9,2,5,3,7,101,18] → LIS=4',    stdin: '', expected: '' },
  { name: 'Strictly asc', description: 'Already increasing — LIS = n',         stdin: '', expected: '' },
  { name: 'Strictly desc', description: 'Reversed — LIS = 1',                  stdin: '', expected: '' },
]
export const LIS_PATIENCE_SAMPLES = LIS_DP_SAMPLES
