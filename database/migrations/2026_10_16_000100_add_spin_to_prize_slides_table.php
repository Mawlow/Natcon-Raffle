<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Whether the prize's photo turns round and round on the Prize Display, like a product on a turntable. */
    public function up(): void
    {
        Schema::table('prize_slides', function (Blueprint $table) {
            $table->boolean('spin')->default(false)->after('image');
        });
    }

    public function down(): void
    {
        Schema::table('prize_slides', function (Blueprint $table) {
            $table->dropColumn('spin');
        });
    }
};
