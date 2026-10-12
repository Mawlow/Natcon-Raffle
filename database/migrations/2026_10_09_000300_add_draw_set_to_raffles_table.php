<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sets: a raffle file's raffles grouped in the order they are drawn —
     * First Set, Second Set, … — chosen on the file's page and followed by
     * the Control Center's raffle list. Null is not in a set yet.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->unsignedTinyInteger('draw_set')->nullable()->after('raffle_file_id');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('draw_set');
        });
    }
};
