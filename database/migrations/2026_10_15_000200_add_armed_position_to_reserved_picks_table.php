<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** The winner slot the reserved pick comes out in, chosen when armed: never first, never last. */
    public function up(): void
    {
        Schema::table('reserved_picks', function (Blueprint $table) {
            $table->unsignedSmallInteger('armed_position')->nullable()->after('armed_raffle_id');
        });
    }

    public function down(): void
    {
        Schema::table('reserved_picks', function (Blueprint $table) {
            $table->dropColumn('armed_position');
        });
    }
};
