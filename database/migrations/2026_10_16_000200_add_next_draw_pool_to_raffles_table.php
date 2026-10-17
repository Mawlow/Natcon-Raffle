<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Who the very next draw picks from — one developer for a replacement — then cleared. */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->json('next_draw_pool')->nullable()->after('draw_filter');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('next_draw_pool');
        });
    }
};
