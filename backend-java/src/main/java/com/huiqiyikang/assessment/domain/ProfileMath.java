package com.huiqiyikang.assessment.domain;

/** Shared profile rules. Stored organization weights use the 0–10 scale. */
public final class ProfileMath {
    private ProfileMath() {}
    public static double decay(double days) { return Math.pow(0.5, Math.max(0, days) / 30.0); }
    public static boolean valid(Double theta, Double confidence, Double answers) {
        return theta != null && Double.isFinite(theta) && theta >= 0 && theta <= 1
            && confidence != null && Double.isFinite(confidence) && confidence > 0 && confidence <= 1
            && answers != null && Double.isFinite(answers) && answers > 0;
    }
    public static double skillThreshold(double weight) {
        return 0.20 + 0.15 * Math.max(0, Math.min(10, weight)) / 10.0;
    }
}
