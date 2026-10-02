<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * How a raffle with several winners is drawn on the display: one winner
     * per press of DRAW, or every winner back to back from a single press.
     */
    public function up(): void
    {
        Schema::table('raffle_settings', function (Blueprint $table) {
            $table->string('draw_mode', 16)->default('one_by_one')->after('roll_duration_ms');
        });
    }

    public function down(): void
    {
        Schema::table('raffle_settings', function (Blueprint $table) {
            $table->dropColumn('draw_mode');
        });
    }
};
