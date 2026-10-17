<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Where a participant is from ("Cebu", "Davao"), read from the
     * masterlist's Location column, so a raffle can be drawn from one place
     * — Cebu only — the way it can from a tag or a developer.
     */
    public function up(): void
    {
        Schema::table('participants', function (Blueprint $table) {
            $table->string('location', 120)->nullable()->after('developers');
            $table->index(['raffle_id', 'location']);
        });
    }

    public function down(): void
    {
        Schema::table('participants', function (Blueprint $table) {
            $table->dropIndex(['raffle_id', 'location']);
            $table->dropColumn('location');
        });
    }
};
